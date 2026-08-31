import { describe, it, expect, beforeEach } from 'vitest';
import type { Firestore } from '@google-cloud/firestore';
import { FirestoreAuthStore } from '@/services/auth/stores/firestore-store';
import type { SessionData } from '@/services/auth/stores';

/**
 * Minimal in-memory fake of the Firestore client surface the store uses:
 * collection(name).doc(id).get()/set()/delete()
 */
function createFakeFirestore() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();

  const col = (name: string) => {
    if (!collections.has(name)) {
      collections.set(name, new Map());
    }
    return collections.get(name)!;
  };

  const firestore = {
    collection(name: string) {
      return {
        doc(id: string) {
          return {
            async get() {
              const data = col(name).get(id);
              return {
                exists: data !== undefined,
                data: () => (data ? { ...data } : undefined),
              };
            },
            async set(data: Record<string, unknown>) {
              col(name).set(id, { ...data });
            },
            async delete() {
              col(name).delete(id);
            },
          };
        },
      };
    },
  };

  return { firestore: firestore as unknown as Firestore, collections };
}

describe('FirestoreAuthStore', () => {
  let store: FirestoreAuthStore;
  let collections: Map<string, Map<string, Record<string, unknown>>>;

  beforeEach(() => {
    const fake = createFakeFirestore();
    collections = fake.collections;
    store = new FirestoreAuthStore({ firestore: fake.firestore });
  });

  it('returns null for missing documents', async () => {
    expect(await store.getSession('nope')).toBeNull();
    expect(await store.getAuthCode('nope')).toBeNull();
    expect(await store.getAccessToken('nope')).toBeNull();
    expect(await store.getRefreshToken('nope')).toBeNull();
  });

  it('round-trips sessions and strips the TTL field', async () => {
    const session: SessionData = {
      sessionId: 'sess-1',
      authenticated: true,
      createdAt: 1000,
      expiresAt: 2000,
      pendingAuthRequest: {
        clientId: 'client',
        redirectUri: 'https://example.com/cb',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
        // state deliberately omitted (optional)
      },
    };

    await store.setSession(session);
    const loaded = await store.getSession('sess-1');

    expect(loaded).toEqual(session);
    expect(loaded).not.toHaveProperty('expireAt');
    // TTL field is persisted for Firestore TTL policies
    expect(collections.get('oauth-sessions')!.get('sess-1')).toHaveProperty('expireAt');
  });

  it('round-trips auth codes and supports deletion', async () => {
    const code = {
      code: 'code-1',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256' as const,
      redirectUri: 'https://example.com/cb',
      createdAt: 1000,
      expiresAt: 2000,
    };

    await store.setAuthCode(code);
    expect(await store.getAuthCode('code-1')).toEqual(code);

    await store.deleteAuthCode('code-1');
    expect(await store.getAuthCode('code-1')).toBeNull();
  });

  it('indexes the paired refresh token when storing an access token', async () => {
    const token = {
      token: 'access-1',
      refreshToken: 'refresh-1',
      createdAt: 1000,
      expiresAt: 2000,
      scope: 'mcp',
    };

    await store.setAccessToken(token);

    expect(await store.getAccessToken('access-1')).toEqual(token);
    expect(await store.getRefreshToken('refresh-1')).toEqual({
      refreshToken: 'refresh-1',
      accessToken: 'access-1',
    });
  });

  it('removes the paired refresh token when deleting an access token', async () => {
    await store.setAccessToken({
      token: 'access-1',
      refreshToken: 'refresh-1',
      createdAt: 1000,
      expiresAt: 2000,
      scope: 'mcp',
    });

    await store.deleteAccessToken('access-1');

    expect(await store.getAccessToken('access-1')).toBeNull();
    expect(await store.getRefreshToken('refresh-1')).toBeNull();
  });

  it('honors a custom collection prefix', async () => {
    const fake = createFakeFirestore();
    const prefixed = new FirestoreAuthStore({
      firestore: fake.firestore,
      collectionPrefix: 'custom-',
    });

    await prefixed.setAuthCode({
      code: 'code-1',
      codeChallenge: 'c',
      codeChallengeMethod: 'plain',
      redirectUri: 'https://example.com/cb',
      createdAt: 1,
      expiresAt: 2,
    });

    expect(fake.collections.has('custom-auth-codes')).toBe(true);
  });
});

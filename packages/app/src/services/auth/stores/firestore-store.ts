import { Firestore, Timestamp } from '@google-cloud/firestore';
import type {
  AuthStore,
  SessionData,
  AuthCodeData,
  AccessTokenData,
  RefreshTokenData,
} from './types.js';
import { logger } from '@/utils/logger';

export interface FirestoreAuthStoreOptions {
  /** Prefix for the four collections (default: 'oauth-'). */
  collectionPrefix?: string;
  /** Existing Firestore instance; defaults to one using ADC. */
  firestore?: Firestore;
}

const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Firestore-backed auth store, so tokens and sessions survive instance
 * restarts (e.g. Cloud Run scale-to-zero). Mirrors the semantics of the
 * in-memory store: expiry is enforced by the auth service via expiresAt;
 * the `expireAt` Timestamp field exists only for Firestore TTL cleanup
 * policies and is never read back.
 */
export class FirestoreAuthStore implements AuthStore {
  private db: Firestore;
  private prefix: string;

  constructor(options: FirestoreAuthStoreOptions = {}) {
    this.db = options.firestore ?? new Firestore();
    this.prefix = options.collectionPrefix ?? 'oauth-';
  }

  private col(name: string) {
    return this.db.collection(`${this.prefix}${name}`);
  }

  private static strip<T>(doc: FirebaseFirestore.DocumentSnapshot): T | null {
    if (!doc.exists) {
      return null;
    }
    const data = { ...(doc.data() as Record<string, unknown>) };
    delete data.expireAt;
    return data as T;
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    return FirestoreAuthStore.strip<SessionData>(await this.col('sessions').doc(sessionId).get());
  }

  async setSession(session: SessionData): Promise<void> {
    // Firestore rejects undefined values; pendingAuthRequest.state is optional
    const doc = JSON.parse(JSON.stringify(session)) as Record<string, unknown>;
    doc.expireAt = Timestamp.fromMillis(session.expiresAt);
    await this.col('sessions').doc(session.sessionId).set(doc);
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.col('sessions').doc(sessionId).delete();
  }

  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    return FirestoreAuthStore.strip<AuthCodeData>(await this.col('auth-codes').doc(code).get());
  }

  async setAuthCode(data: AuthCodeData): Promise<void> {
    await this.col('auth-codes')
      .doc(data.code)
      .set({ ...data, expireAt: Timestamp.fromMillis(data.expiresAt) });
  }

  async deleteAuthCode(code: string): Promise<void> {
    await this.col('auth-codes').doc(code).delete();
  }

  async getAccessToken(token: string): Promise<AccessTokenData | null> {
    return FirestoreAuthStore.strip<AccessTokenData>(
      await this.col('access-tokens').doc(token).get(),
    );
  }

  async setAccessToken(data: AccessTokenData): Promise<void> {
    // Mirror the in-memory store: also index the paired refresh token
    await this.col('access-tokens')
      .doc(data.token)
      .set({ ...data, expireAt: Timestamp.fromMillis(data.expiresAt) });
    await this.setRefreshToken({ refreshToken: data.refreshToken, accessToken: data.token });
  }

  async deleteAccessToken(token: string): Promise<void> {
    const data = await this.getAccessToken(token);
    if (data) {
      await this.deleteRefreshToken(data.refreshToken);
    }
    await this.col('access-tokens').doc(token).delete();
  }

  async getRefreshToken(refreshToken: string): Promise<RefreshTokenData | null> {
    return FirestoreAuthStore.strip<RefreshTokenData>(
      await this.col('refresh-tokens').doc(refreshToken).get(),
    );
  }

  async setRefreshToken(data: RefreshTokenData): Promise<void> {
    await this.col('refresh-tokens')
      .doc(data.refreshToken)
      .set({ ...data, expireAt: Timestamp.fromMillis(Date.now() + REFRESH_TOKEN_TTL_MS) });
  }

  async deleteRefreshToken(refreshToken: string): Promise<void> {
    await this.col('refresh-tokens').doc(refreshToken).delete();
  }
}

export function createFirestoreAuthStore(options: FirestoreAuthStoreOptions = {}): AuthStore {
  logger.info('Creating Firestore auth store');
  return new FirestoreAuthStore(options);
}

import crypto from 'crypto';
import { getAuthStore } from './auth-store-singleton.js';
import type { SessionData } from './stores/types.js';

const SESSION_EXPIRY_MS = Number(process.env.SESSION_EXPIRY_MS || 24 * 60 * 60 * 1000);

export type Session = SessionData;

function generateSessionId(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createSession(): Promise<string> {
  try {
    const sessionId = generateSessionId();
    const now = Date.now();

    const session: Session = {
      sessionId,
      authenticated: false,
      createdAt: now,
      expiresAt: now + SESSION_EXPIRY_MS,
    };

    const store = getAuthStore();
    await store.setSession(session);

    return sessionId;
  } catch (error) {
    console.error('[auth] Error creating session:', error);
    throw error;
  }
}

export async function getSession(sessionId: string): Promise<Session | null> {
  try {
    if (!sessionId) {
      return null;
    }

    const store = getAuthStore();
    const session = await store.getSession(sessionId);

    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      await store.deleteSession(sessionId);
      return null;
    }

    return session;
  } catch (error) {
    console.error('[auth] Error getting session:', error);
    return null;
  }
}

export async function authenticateSession(
  sessionId: string,
  providedToken: string,
): Promise<boolean> {
  const session = await getSession(sessionId);

  if (!session) {
    return false;
  }

  const validToken = process.env.PERSONAL_AUTH_TOKEN;

  if (!validToken) {
    console.error('PERSONAL_AUTH_TOKEN not configured');
    return false;
  }

  if (typeof providedToken !== 'string') {
    return false;
  }

  const validBuffer = Buffer.from(validToken);
  const providedBuffer = Buffer.from(providedToken);

  if (validBuffer.length !== providedBuffer.length) {
    return false;
  }

  const isValid = crypto.timingSafeEqual(validBuffer, providedBuffer);

  if (isValid) {
    const updatedSession: Session = {
      ...session,
      authenticated: true,
    };
    const store = getAuthStore();
    await store.setSession(updatedSession);
  }

  return isValid;
}

export async function storePendingAuthRequest(
  sessionId: string,
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  codeChallengeMethod: 'S256' | 'plain',
  state?: string,
): Promise<boolean> {
  try {
    const session = await getSession(sessionId);

    if (!session) {
      console.error('[auth] Session not found:', sessionId);
      return false;
    }

    const updatedSession: Session = {
      ...session,
      pendingAuthRequest: {
        clientId,
        redirectUri,
        state,
        codeChallenge,
        codeChallengeMethod,
      },
    };

    const store = getAuthStore();
    await store.setSession(updatedSession);

    return true;
  } catch (error) {
    console.error('[auth] Error storing pending auth request:', error);
    return false;
  }
}

export async function consumePendingAuthRequest(
  sessionId: string,
): Promise<Session['pendingAuthRequest'] | null> {
  const session = await getSession(sessionId);

  if (!session || !session.authenticated || !session.pendingAuthRequest) {
    return null;
  }

  const request = session.pendingAuthRequest;

  const updatedSession: Session = {
    ...session,
    pendingAuthRequest: undefined,
  };

  const store = getAuthStore();
  await store.setSession(updatedSession);

  return request;
}

export async function isAuthenticated(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  return session?.authenticated || false;
}

export async function destroySession(sessionId: string): Promise<void> {
  const store = getAuthStore();
  await store.deleteSession(sessionId);
}

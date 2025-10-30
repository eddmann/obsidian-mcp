import type {
  AuthStore,
  SessionData,
  AuthCodeData,
  AccessTokenData,
  RefreshTokenData,
} from './types.js';

export class InMemoryAuthStore implements AuthStore {
  private sessions = new Map<string, SessionData>();
  private authCodes = new Map<string, AuthCodeData>();
  private accessTokens = new Map<string, AccessTokenData>();
  private refreshTokens = new Map<string, RefreshTokenData>();

  async getSession(sessionId: string): Promise<SessionData | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }
    return {
      ...session,
      pendingAuthRequest: session.pendingAuthRequest
        ? { ...session.pendingAuthRequest }
        : undefined,
    };
  }

  async setSession(session: SessionData): Promise<void> {
    const copy: SessionData = {
      ...session,
      pendingAuthRequest: session.pendingAuthRequest
        ? { ...session.pendingAuthRequest }
        : undefined,
    };
    this.sessions.set(session.sessionId, copy);
  }

  async deleteSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    return this.authCodes.get(code) || null;
  }

  async setAuthCode(data: AuthCodeData): Promise<void> {
    this.authCodes.set(data.code, { ...data });
  }

  async deleteAuthCode(code: string): Promise<void> {
    this.authCodes.delete(code);
  }

  async getAccessToken(token: string): Promise<AccessTokenData | null> {
    return this.accessTokens.get(token) || null;
  }

  async setAccessToken(data: AccessTokenData): Promise<void> {
    this.accessTokens.set(data.token, { ...data });
    this.refreshTokens.set(data.refreshToken, {
      refreshToken: data.refreshToken,
      accessToken: data.token,
    });
  }

  async deleteAccessToken(token: string): Promise<void> {
    const data = this.accessTokens.get(token);
    if (data) {
      this.refreshTokens.delete(data.refreshToken);
    }
    this.accessTokens.delete(token);
  }

  async getRefreshToken(refreshToken: string): Promise<RefreshTokenData | null> {
    return this.refreshTokens.get(refreshToken) || null;
  }

  async setRefreshToken(data: RefreshTokenData): Promise<void> {
    this.refreshTokens.set(data.refreshToken, { ...data });
  }

  async deleteRefreshToken(refreshToken: string): Promise<void> {
    this.refreshTokens.delete(refreshToken);
  }
}

export function createInMemoryAuthStore(): AuthStore {
  console.error('[auth-store] Creating in-memory auth store');
  return new InMemoryAuthStore();
}

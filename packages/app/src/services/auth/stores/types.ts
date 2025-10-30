export interface SessionData {
  sessionId: string;
  authenticated: boolean;
  createdAt: number;
  expiresAt: number;
  pendingAuthRequest?: {
    clientId: string;
    redirectUri: string;
    state?: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256' | 'plain';
  };
}

export interface AuthCodeData {
  code: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}

export interface AccessTokenData {
  token: string;
  refreshToken: string;
  createdAt: number;
  expiresAt: number;
  scope: string;
}

export interface RefreshTokenData {
  refreshToken: string;
  accessToken: string;
}

export interface SessionRepository {
  getSession(sessionId: string): Promise<SessionData | null>;
  setSession(session: SessionData): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export interface OAuthTokenRepository {
  getAuthCode(code: string): Promise<AuthCodeData | null>;
  setAuthCode(data: AuthCodeData): Promise<void>;
  deleteAuthCode(code: string): Promise<void>;

  getAccessToken(token: string): Promise<AccessTokenData | null>;
  setAccessToken(data: AccessTokenData): Promise<void>;
  deleteAccessToken(token: string): Promise<void>;

  getRefreshToken(refreshToken: string): Promise<RefreshTokenData | null>;
  setRefreshToken(data: RefreshTokenData): Promise<void>;
  deleteRefreshToken(refreshToken: string): Promise<void>;
}

export interface AuthStore extends SessionRepository, OAuthTokenRepository {}

import {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

// ========== DATA TYPES ==========

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

// ========== REPOSITORY INTERFACES ==========

/**
 * SessionRepository - Browser session management
 *
 * Handles cookie-based authentication for the OAuth web pages (login, consent).
 * Sessions track logged-in users in the browser.
 */
export interface SessionRepository {
  // Session CRUD operations
  getSession(sessionId: string): Promise<SessionData | null>;
  setSession(session: SessionData): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

/**
 * OAuthTokenRepository - OAuth 2.0 token management
 *
 * Handles all OAuth token lifecycle operations including:
 * - Authorization codes (temporary, single-use, 10min expiry)
 * - Access tokens (Bearer tokens for API auth, 1hr expiry)
 * - Refresh tokens (long-lived tokens to obtain new access tokens)
 */
export interface OAuthTokenRepository {
  // Authorization Code operations (OAuth step 1)
  getAuthCode(code: string): Promise<AuthCodeData | null>;
  setAuthCode(data: AuthCodeData): Promise<void>;
  deleteAuthCode(code: string): Promise<void>;

  // Access Token operations (OAuth step 2 - API authentication)
  getAccessToken(token: string): Promise<AccessTokenData | null>;
  setAccessToken(data: AccessTokenData): Promise<void>;
  deleteAccessToken(token: string): Promise<void>;

  // Refresh Token operations (OAuth step 3 - token renewal)
  getRefreshToken(refreshToken: string): Promise<RefreshTokenData | null>;
  setRefreshToken(data: RefreshTokenData): Promise<void>;
  deleteRefreshToken(refreshToken: string): Promise<void>;
}

/**
 * AuthStore - Combined authentication store
 *
 * Unified interface that includes both browser session management
 * and OAuth token operations. Implementations can use a single
 * storage backend (e.g., one DynamoDB table with prefixed keys).
 */
export interface AuthStore extends SessionRepository, OAuthTokenRepository {}

/**
 * InMemoryAuthStore - In-memory implementation
 *
 * Stores all data in memory using Map. Suitable for:
 * - Local development
 * - Testing
 * - Single-instance deployments
 *
 * Note: Data is lost when process restarts.
 */
export class InMemoryAuthStore implements AuthStore {
  // Storage maps
  private sessions = new Map<string, SessionData>();
  private authCodes = new Map<string, AuthCodeData>();
  private accessTokens = new Map<string, AccessTokenData>();
  private refreshTokens = new Map<string, RefreshTokenData>();

  // ========== SessionRepository Implementation ==========

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

  // ========== OAuthTokenRepository Implementation ==========

  // Authorization Code operations
  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    return this.authCodes.get(code) || null;
  }

  async setAuthCode(data: AuthCodeData): Promise<void> {
    this.authCodes.set(data.code, { ...data });
  }

  async deleteAuthCode(code: string): Promise<void> {
    this.authCodes.delete(code);
  }

  // Access Token operations
  async getAccessToken(token: string): Promise<AccessTokenData | null> {
    return this.accessTokens.get(token) || null;
  }

  async setAccessToken(data: AccessTokenData): Promise<void> {
    this.accessTokens.set(data.token, { ...data });
    // Also store the bidirectional refresh token link
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

  // Refresh Token operations
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

interface DynamoDbAuthStoreOptions {
  tableName: string;
  region: string;
  ttlAttribute?: string;
  client?: DynamoDBClient;
}

/**
 * DynamoDbAuthStore - DynamoDB implementation
 *
 * Stores all data in a single DynamoDB table using prefixed keys:
 * - session:* - Browser sessions
 * - authcode:* - Authorization codes
 * - token:* - Access tokens
 * - refresh:* - Refresh tokens
 *
 * Suitable for:
 * - Production deployments
 * - Lambda environments
 * - Multi-instance scalability
 *
 * Features:
 * - TTL-based automatic cleanup
 * - Consistent reads for token validation
 * - Single-table design for cost efficiency
 */
export class DynamoDbAuthStore implements AuthStore {
  private client: DynamoDBClient;
  private tableName: string;
  private ttlAttribute: string;

  constructor(options: DynamoDbAuthStoreOptions) {
    this.tableName = options.tableName;
    this.ttlAttribute = options.ttlAttribute ?? 'ttl';
    this.client =
      options.client ??
      new DynamoDBClient({
        region: options.region,
      });
  }

  // ========== SessionRepository Implementation ==========

  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const result = await this.client.send(
        new GetItemCommand({
          TableName: this.tableName,
          Key: marshall({ sessionId: `session:${sessionId}` }),
          ConsistentRead: true,
        }),
      );

      if (!result.Item) {
        return null;
      }

      const data = unmarshall(result.Item);

      const session: SessionData = {
        sessionId: data.sessionId.replace(/^session:/, ''),
        authenticated: !!data.authenticated,
        createdAt: Number(data.createdAt),
        expiresAt: Number(data.expiresAt),
        pendingAuthRequest: data.pendingAuthRequest
          ? {
              clientId: data.pendingAuthRequest.clientId,
              redirectUri: data.pendingAuthRequest.redirectUri,
              state: data.pendingAuthRequest.state,
              codeChallenge: data.pendingAuthRequest.codeChallenge,
              codeChallengeMethod: data.pendingAuthRequest.codeChallengeMethod,
            }
          : undefined,
      };

      return session;
    } catch (error) {
      console.error('[DynamoDB] Error getting session:', error);
      throw error;
    }
  }

  async setSession(session: SessionData): Promise<void> {
    try {
      const item: Record<string, any> = {
        sessionId: `session:${session.sessionId}`,
        authenticated: session.authenticated,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        [this.ttlAttribute]: Math.floor(session.expiresAt / 1000),
      };

      if (session.pendingAuthRequest) {
        item.pendingAuthRequest = session.pendingAuthRequest;
      }

      await this.client.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
        }),
      );
    } catch (error) {
      console.error('[DynamoDB] Error setting session:', error);
      throw error;
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.client.send(
      new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({ sessionId: `session:${sessionId}` }),
      }),
    );
  }

  // ========== OAuthTokenRepository Implementation ==========

  // Authorization Code operations
  async getAuthCode(code: string): Promise<AuthCodeData | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ sessionId: `authcode:${code}` }),
        ConsistentRead: true,
      }),
    );

    if (!result.Item) {
      return null;
    }

    const data = unmarshall(result.Item);
    return {
      code: data.code,
      codeChallenge: data.codeChallenge,
      codeChallengeMethod: data.codeChallengeMethod,
      redirectUri: data.redirectUri,
      createdAt: Number(data.createdAt),
      expiresAt: Number(data.expiresAt),
    };
  }

  async setAuthCode(authData: AuthCodeData): Promise<void> {
    const item = {
      sessionId: `authcode:${authData.code}`,
      code: authData.code,
      codeChallenge: authData.codeChallenge,
      codeChallengeMethod: authData.codeChallengeMethod,
      redirectUri: authData.redirectUri,
      createdAt: authData.createdAt,
      expiresAt: authData.expiresAt,
      [this.ttlAttribute]: Math.floor(authData.expiresAt / 1000),
    };

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item),
      }),
    );
  }

  async deleteAuthCode(code: string): Promise<void> {
    await this.client.send(
      new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({ sessionId: `authcode:${code}` }),
      }),
    );
  }

  // Access Token operations
  async getAccessToken(token: string): Promise<AccessTokenData | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ sessionId: `token:${token}` }),
        ConsistentRead: true,
      }),
    );

    if (!result.Item) {
      return null;
    }

    const data = unmarshall(result.Item);
    return {
      token: data.token,
      refreshToken: data.refreshToken,
      createdAt: Number(data.createdAt),
      expiresAt: Number(data.expiresAt),
      scope: data.scope,
    };
  }

  async setAccessToken(tokenData: AccessTokenData): Promise<void> {
    const item = {
      sessionId: `token:${tokenData.token}`,
      token: tokenData.token,
      refreshToken: tokenData.refreshToken,
      createdAt: tokenData.createdAt,
      expiresAt: tokenData.expiresAt,
      scope: tokenData.scope,
      [this.ttlAttribute]: Math.floor(tokenData.expiresAt / 1000),
    };

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item),
      }),
    );

    await this.setRefreshToken({
      refreshToken: tokenData.refreshToken,
      accessToken: tokenData.token,
    });
  }

  async deleteAccessToken(token: string): Promise<void> {
    const result = await this.client.send(
      new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({ sessionId: `token:${token}` }),
        ReturnValues: 'ALL_OLD',
      }),
    );

    if (result.Attributes) {
      const data = unmarshall(result.Attributes);
      if (data.refreshToken) {
        await this.deleteRefreshToken(data.refreshToken);
      }
    }
  }

  // Refresh Token operations
  async getRefreshToken(refreshToken: string): Promise<RefreshTokenData | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ sessionId: `refresh:${refreshToken}` }),
        ConsistentRead: true,
      }),
    );

    if (!result.Item) {
      return null;
    }

    const data = unmarshall(result.Item);
    return {
      refreshToken: data.refreshToken,
      accessToken: data.accessToken,
    };
  }

  async setRefreshToken(refreshData: RefreshTokenData): Promise<void> {
    const item = {
      sessionId: `refresh:${refreshData.refreshToken}`,
      refreshToken: refreshData.refreshToken,
      accessToken: refreshData.accessToken,
      [this.ttlAttribute]: Math.floor(Date.now() / 1000) + REFRESH_TOKEN_TTL_SECONDS,
    };

    await this.client.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item),
      }),
    );
  }

  async deleteRefreshToken(refreshToken: string): Promise<void> {
    await this.client.send(
      new DeleteItemCommand({
        TableName: this.tableName,
        Key: marshall({ sessionId: `refresh:${refreshToken}` }),
      }),
    );
  }
}

/**
 * Create an in-memory auth store
 *
 * Used by:
 * - Local HTTP server (development)
 * - Local stdio server (development)
 */
export function createInMemoryAuthStore(): AuthStore {
  console.error('[auth-store] Creating in-memory auth store');
  return new InMemoryAuthStore();
}

/**
 * Create a DynamoDB auth store
 *
 * Used by:
 * - Lambda deployment (production)
 *
 * @param options - DynamoDB configuration
 */
export function createDynamoDbAuthStore(options: DynamoDbAuthStoreOptions): AuthStore {
  console.error('[auth-store] Creating DynamoDB auth store:', {
    tableName: options.tableName,
    region: options.region,
    ttlAttribute: options.ttlAttribute || 'ttl',
  });
  return new DynamoDbAuthStore(options);
}

/**
 * Export the options interface for external use
 */
export type { DynamoDbAuthStoreOptions };

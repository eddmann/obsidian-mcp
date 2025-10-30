import {
  DynamoDBClient,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type {
  AuthStore,
  SessionData,
  AuthCodeData,
  AccessTokenData,
  RefreshTokenData,
} from './types.js';

const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface DynamoDbAuthStoreOptions {
  tableName: string;
  region: string;
  ttlAttribute?: string;
  client?: DynamoDBClient;
}

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

export function createDynamoDbAuthStore(options: DynamoDbAuthStoreOptions): AuthStore {
  console.error('[auth-store] Creating DynamoDB auth store:', {
    tableName: options.tableName,
    region: options.region,
    ttlAttribute: options.ttlAttribute || 'ttl',
  });
  return new DynamoDbAuthStore(options);
}

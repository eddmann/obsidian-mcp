import { getAuthStore } from './auth-store-singleton.js';
import { generateSecureToken, verifyCodeChallenge } from './pkce.js';

const AUTH_CODE_EXPIRY = 10 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY = 60 * 60 * 1000;

export async function createAuthorizationCode(
  codeChallenge: string,
  codeChallengeMethod: 'S256' | 'plain',
  redirectUri: string,
): Promise<string> {
  const code = generateSecureToken();
  const now = Date.now();

  const store = getAuthStore();
  await store.setAuthCode({
    code,
    codeChallenge,
    codeChallengeMethod,
    redirectUri,
    createdAt: now,
    expiresAt: now + AUTH_CODE_EXPIRY,
  });

  return code;
}

export async function exchangeCodeForToken(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | null> {
  const expectedClientId = process.env.OAUTH_CLIENT_ID || 'obsidian-mcp-client';
  if (clientId !== expectedClientId) {
    return null;
  }

  const store = getAuthStore();
  const authCode = await store.getAuthCode(code);

  if (!authCode) {
    return null;
  }

  if (Date.now() > authCode.expiresAt) {
    await store.deleteAuthCode(code);
    return null;
  }

  if (authCode.redirectUri !== redirectUri) {
    return null;
  }

  if (!verifyCodeChallenge(codeVerifier, authCode.codeChallenge, authCode.codeChallengeMethod)) {
    return null;
  }

  await store.deleteAuthCode(code);

  const accessToken = generateSecureToken();
  const refreshToken = generateSecureToken();
  const now = Date.now();

  const tokenData = {
    token: accessToken,
    refreshToken,
    createdAt: now,
    expiresAt: now + ACCESS_TOKEN_EXPIRY,
    scope: 'vault:read vault:write',
  };

  await store.setAccessToken(tokenData);
  return {
    accessToken,
    refreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
} | null> {
  const store = getAuthStore();
  const refreshData = await store.getRefreshToken(refreshToken);

  if (!refreshData) {
    return null;
  }

  const oldTokenData = await store.getAccessToken(refreshData.accessToken);
  if (!oldTokenData) {
    await store.deleteRefreshToken(refreshToken);
    return null;
  }

  await store.deleteAccessToken(refreshData.accessToken);

  const newAccessToken = generateSecureToken();
  const newRefreshToken = generateSecureToken();
  const now = Date.now();

  const tokenData = {
    token: newAccessToken,
    refreshToken: newRefreshToken,
    createdAt: now,
    expiresAt: now + ACCESS_TOKEN_EXPIRY,
    scope: oldTokenData.scope,
  };

  await store.setAccessToken(tokenData);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY / 1000),
  };
}

export async function validateAccessToken(token: string): Promise<boolean> {
  const store = getAuthStore();
  const tokenData = await store.getAccessToken(token);

  if (!tokenData) {
    return false;
  }

  if (Date.now() > tokenData.expiresAt) {
    await store.deleteAccessToken(token);
    return false;
  }

  return true;
}

export async function revokeToken(token: string): Promise<boolean> {
  const store = getAuthStore();
  const tokenData = await store.getAccessToken(token);

  if (!tokenData) {
    return false;
  }

  await store.deleteAccessToken(token);

  return true;
}

export function validateClientCredentials(clientId: string, clientSecret: string): boolean {
  const validClientId = process.env.OAUTH_CLIENT_ID || 'obsidian-mcp-client';
  const validClientSecret = process.env.OAUTH_CLIENT_SECRET;

  if (!validClientSecret) {
    console.error('OAUTH_CLIENT_SECRET not configured');
    return false;
  }

  return clientId === validClientId && clientSecret === validClientSecret;
}

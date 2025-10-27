/**
 * Shared OAuth 2.0 Routes
 *
 * OAuth endpoints used by both local and Lambda HTTP servers
 */

import { Express, Response } from 'express';
import cookieParser from 'cookie-parser';
import * as auth from '@/services/auth';
import * as pages from '@/ui/oauth-pages';

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  baseUrl: string;
}

const SESSION_EXPIRY_MS = Number(process.env.SESSION_EXPIRY_MS || 24 * 60 * 60 * 1000);

/**
 * Register all OAuth 2.0 endpoints on an Express app
 */
export function registerOAuthRoutes(app: Express, config: OAuthConfig): void {
  const { clientId, clientSecret, baseUrl } = config;

  app.use(cookieParser());

  const secureCookies = baseUrl.startsWith('https://');
  const sessionCookieOptions = {
    httpOnly: true,
    secure: secureCookies,
    sameSite: 'lax' as const,
    maxAge: SESSION_EXPIRY_MS,
    path: '/',
  };

  const setSessionCookie = (res: Response, sessionId: string) => {
    res.cookie('session_id', sessionId, sessionCookieOptions);
  };

  // OAuth Discovery Endpoint (for MCP clients)
  app.get('/.well-known/oauth-authorization-server', (_req, res) => {
    res.json({
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256', 'plain'],
      token_endpoint_auth_methods_supported: ['client_secret_post'],
    });
  });

  // Login Page (GET /login)
  app.get('/login', async (req, res) => {
    let sessionId = req.cookies?.session_id;
    const session = sessionId ? await auth.getSession(sessionId) : null;

    if (!session) {
      sessionId = await auth.createSession();
      setSessionCookie(res, sessionId);
    }

    res.send(pages.loginPage());
  });

  // Login Handler (POST /login)
  app.post('/login', async (req, res) => {
    const { token } = req.body;
    let sessionId = req.cookies?.session_id;
    const session = sessionId ? await auth.getSession(sessionId) : null;

    if (!session) {
      sessionId = await auth.createSession();
      setSessionCookie(res, sessionId);
    }

    if (!token) {
      res.send(pages.loginPage('Please enter your authentication token'));
      return;
    }

    if (!sessionId) {
      res.send(pages.loginPage('Unable to establish session'));
      return;
    }

    if (await auth.authenticateSession(sessionId, token)) {
      setSessionCookie(res, sessionId);
      res.redirect('/oauth/consent');
    } else {
      res.send(pages.loginPage('Invalid authentication token'));
    }
  });

  // Authorization Endpoint (GET /oauth/authorize)
  app.get('/oauth/authorize', async (req, res) => {
    const { response_type, client_id, redirect_uri, state, code_challenge, code_challenge_method } =
      req.query;

    // Check for missing required parameters first
    if (
      !response_type ||
      !client_id ||
      !redirect_uri ||
      !code_challenge ||
      !code_challenge_method
    ) {
      return res
        .status(400)
        .send(pages.errorPage('invalid_request', 'Missing required parameters'));
    }

    if (response_type !== 'code') {
      return res
        .status(400)
        .send(
          pages.errorPage('unsupported_response_type', 'Only "code" response type is supported'),
        );
    }

    if (client_id !== clientId) {
      return res.status(400).send(pages.errorPage('invalid_client', 'Unknown client ID'));
    }

    if (code_challenge_method !== 'S256' && code_challenge_method !== 'plain') {
      return res
        .status(400)
        .send(pages.errorPage('invalid_request', 'code_challenge_method must be S256 or plain'));
    }

    let sessionId = req.cookies?.session_id;
    const session = sessionId ? await auth.getSession(sessionId) : null;

    if (!session) {
      sessionId = await auth.createSession();
      setSessionCookie(res, sessionId);
    }

    if (!sessionId) {
      return res.status(500).send(pages.errorPage('server_error', 'Unable to establish session'));
    }

    const stored = await auth.storePendingAuthRequest(
      sessionId,
      client_id as string,
      redirect_uri as string,
      code_challenge as string,
      code_challenge_method as 'S256' | 'plain',
      state as string | undefined,
    );

    if (!stored) {
      return res
        .status(400)
        .send(pages.errorPage('invalid_request', 'Unable to store authorization request'));
    }

    if (!(await auth.isAuthenticated(sessionId))) {
      return res.redirect('/login');
    }

    return res.redirect('/oauth/consent');
  });

  // Consent Screen (GET /oauth/consent)
  app.get('/oauth/consent', async (req, res) => {
    const sessionId = req.cookies?.session_id;

    if (!sessionId || !(await auth.isAuthenticated(sessionId))) {
      return res.redirect('/login');
    }

    const session = await auth.getSession(sessionId);
    if (!session?.pendingAuthRequest) {
      return res
        .status(400)
        .send(pages.errorPage('invalid_request', 'No pending authorization request'));
    }

    res.send(pages.consentPage(session.pendingAuthRequest.clientId));
  });

  // Approve Authorization (POST /oauth/approve)
  app.post('/oauth/approve', async (req, res) => {
    const sessionId = req.cookies?.session_id;

    if (!sessionId || !(await auth.isAuthenticated(sessionId))) {
      return res.redirect('/login');
    }

    const pending = await auth.consumePendingAuthRequest(sessionId);

    if (!pending) {
      return res
        .status(400)
        .send(pages.errorPage('invalid_request', 'No pending authorization request'));
    }

    const code = await auth.createAuthorizationCode(
      pending.codeChallenge,
      pending.codeChallengeMethod,
      pending.redirectUri,
    );

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (pending.state) {
      redirectUrl.searchParams.set('state', pending.state);
    }

    res.redirect(redirectUrl.toString());
  });

  // Deny Authorization (GET /oauth/deny)
  app.get('/oauth/deny', async (req, res) => {
    const sessionId = req.cookies?.session_id;

    if (sessionId) {
      const pending = await auth.consumePendingAuthRequest(sessionId);

      if (pending) {
        const redirectUrl = new URL(pending.redirectUri);
        redirectUrl.searchParams.set('error', 'access_denied');
        redirectUrl.searchParams.set('error_description', 'User denied authorization');
        if (pending.state) {
          redirectUrl.searchParams.set('state', pending.state);
        }

        return res.redirect(redirectUrl.toString());
      }
    }

    res.send(pages.errorPage('access_denied', 'Authorization was denied'));
  });

  // Token Endpoint (POST /oauth/token)
  app.post('/oauth/token', async (req, res) => {
    const {
      grant_type,
      code,
      code_verifier,
      redirect_uri,
      client_id,
      client_secret,
      refresh_token,
    } = req.body;

    if (!auth.validateClientCredentials(client_id, client_secret)) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client credentials',
      });
    }

    if (grant_type === 'authorization_code') {
      if (!code || !code_verifier || !redirect_uri) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing required parameters',
        });
      }

      const result = await auth.exchangeCodeForToken(code, code_verifier, redirect_uri, client_id);

      if (!result) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired authorization code',
        });
      }

      return res.json({
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
      });
    } else if (grant_type === 'refresh_token') {
      if (!refresh_token) {
        return res.status(400).json({
          error: 'invalid_request',
          error_description: 'Missing refresh_token parameter',
        });
      }

      const result = await auth.refreshAccessToken(refresh_token);

      if (!result) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'Invalid or expired refresh token',
        });
      }

      return res.json({
        access_token: result.accessToken,
        token_type: 'Bearer',
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
      });
    }

    return res.status(400).json({
      error: 'unsupported_grant_type',
      error_description: 'Only authorization_code and refresh_token grant types are supported',
    });
  });

  // Dynamic Client Registration (RFC 7591)
  app.post('/oauth/register', (req, res) => {
    const body = req.body ?? {};
    const redirectUris = body.redirect_uris;

    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      return res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: 'redirect_uris must be provided as a non-empty array of strings',
      });
    }

    if (redirectUris.some(uri => typeof uri !== 'string')) {
      return res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: 'Each redirect URI must be a string',
      });
    }

    if (!clientSecret) {
      return res.status(500).json({
        error: 'server_error',
        error_description: 'OAuth client secret is not configured on the server',
      });
    }

    const issuedAt = Math.floor(Date.now() / 1000);

    return res.status(201).json({
      client_id: clientId,
      client_secret: clientSecret,
      token_endpoint_auth_method: 'client_secret_post',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      redirect_uris: redirectUris,
      client_name: body.client_name ?? 'obsidian-mcp',
      client_id_issued_at: issuedAt,
    });
  });

  // Revocation Endpoint (POST /oauth/revoke)
  app.post('/oauth/revoke', async (req, res) => {
    const { token, client_id, client_secret } = req.body;

    if (!auth.validateClientCredentials(client_id, client_secret)) {
      return res.status(401).json({
        error: 'invalid_client',
        error_description: 'Invalid client credentials',
      });
    }

    if (!token) {
      return res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing token parameter',
      });
    }

    await auth.revokeToken(token);

    return res.status(200).json({});
  });
}

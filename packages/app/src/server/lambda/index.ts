/**
 * AWS Lambda Handler for Obsidian MCP Server
 *
 * Serverless Lambda Function URL handler with OAuth 2.0 authentication
 * Uses DynamoDB for session storage
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VaultManager } from '@/services/vault-manager';
import { GitVaultManager } from '@/services/git-vault-manager';
import { detectStartType, getInvocationCount, cleanupOldCache } from './cache.js';
import { registerTools } from '@/mcp/tool-registrations';
import { registerResources } from '@/mcp/resource-registrations';
import { registerOAuthRoutes } from '@/server/shared/oauth-routes';
import { registerMcpRoute } from '@/server/shared/mcp-routes';
import { createDynamoDbAuthStore } from '@/services/auth/stores';
import { setAuthStore } from '@/services/auth';
import { ensureEnvVars } from '@/env';
import { MCP_SERVER_INSTRUCTIONS } from '@/server/shared/instructions';
import { configureLogger, logger } from '@/utils/logger';
import express from 'express';
import serverless from 'serverless-http';
import crypto from 'crypto';

configureLogger({
  stream: process.stdout,
  minLevel: (process.env.LOG_LEVEL as any) || 'info',
});

const tableName = process.env.SESSION_DYNAMODB_TABLE;
const region = process.env.SESSION_DYNAMODB_REGION || process.env.AWS_REGION || 'us-east-1';
const ttlAttribute = process.env.SESSION_DYNAMODB_TTL_ATTRIBUTE || 'ttl';

if (!tableName) {
  throw new Error('SESSION_DYNAMODB_TABLE must be set for Lambda deployment');
}

ensureEnvVars();

setAuthStore(
  createDynamoDbAuthStore({
    tableName,
    region,
    ttlAttribute,
  }),
);

let vaultManager: VaultManager | null = null;

function getVaultManager(): VaultManager {
  if (!vaultManager) {
    const config = {
      repoUrl: process.env.VAULT_REPO!,
      branch: process.env.VAULT_BRANCH!,
      gitToken: process.env.GIT_TOKEN!,
      gitUsername: process.env.GIT_USERNAME,
      vaultPath: '/tmp/obsidian-vault',
    };

    vaultManager = new GitVaultManager(config);
  }

  return vaultManager;
}

const mcpServer = new McpServer({
  name: 'obsidian-mcp',
  version: '1.0.0',
  instructions: MCP_SERVER_INSTRUCTIONS,
});

registerTools(mcpServer, getVaultManager);
registerResources(mcpServer, getVaultManager);

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID || 'obsidian-mcp-client';
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || 'https://localhost';

if (!OAUTH_CLIENT_SECRET) {
  throw new Error(
    'OAUTH_CLIENT_SECRET is required for Lambda deployment. ' +
      'Set it in your CDK stack environment variables.',
  );
}

let coldStartLogged = false;
function logColdStartConfig() {
  if (!coldStartLogged) {
    coldStartLogged = true;
    logger.info('Lambda cold start - Auth store configured', {
      type: 'DynamoDB',
      tableName,
      region,
      ttlAttribute,
      sessionExpiryMs: process.env.SESSION_EXPIRY_MS || '86400000',
    });
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, _res, next) => {
  const startType = detectStartType();
  if (startType === 'cold') {
    logColdStartConfig();
  }

  // Skip logging health checks
  if (req.path === '/health') {
    return next();
  }

  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  const startTime = Date.now();

  logger.info('Lambda invoked', {
    requestId,
    startType,
    invocation: getInvocationCount(),
    path: req.path,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    hasAuth: !!req.headers.authorization,
  });

  // Log response time on finish
  _res.on('finish', () => {
    logger.info('Lambda request completed', {
      requestId,
      path: req.path,
      method: req.method,
      statusCode: _res.statusCode,
      durationMs: Date.now() - startTime,
    });
  });

  if (getInvocationCount() === 1) {
    cleanupOldCache().catch(err => logger.error('Cache cleanup error', { error: err }));
  }

  next();
});

registerOAuthRoutes(app, {
  clientId: OAUTH_CLIENT_ID,
  clientSecret: OAUTH_CLIENT_SECRET,
  baseUrl: BASE_URL,
});

registerMcpRoute(app, mcpServer);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    oauth: 'enabled',
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'obsidian-mcp',
    version: '1.0.0',
    oauth: 'enabled',
  });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export const handler = serverless(app);

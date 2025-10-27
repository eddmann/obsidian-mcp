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
import { registerOAuthRoutes } from '@/server/shared/oauth-routes';
import { registerMcpRoute } from '@/server/shared/mcp-routes';
import { createDynamoDbAuthStore } from '@/services/auth/auth-store';
import { setAuthStore } from '@/services/auth';
import { ensureEnvVars } from '@/env';
import { MCP_SERVER_INSTRUCTIONS } from '@/server/shared/instructions';
import express from 'express';
import serverless from 'serverless-http';

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
      githubPat: process.env.GITHUB_PAT!,
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
    console.error('[lambda] Cold start - Auth store configured:', {
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

  console.error('Lambda invoked:', {
    startType,
    invocation: getInvocationCount(),
    path: req.path,
    method: req.method,
    oauth: 'enabled',
  });

  if (getInvocationCount() === 1) {
    cleanupOldCache().catch(err => console.error('Cache cleanup error:', err));
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

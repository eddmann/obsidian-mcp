#!/usr/bin/env node
/**
 * Local MCP Server Runner
 *
 * Runs the Obsidian MCP server locally using stdio transport.
 * Perfect for testing with Claude Desktop or other MCP clients.
 *
 * Usage:
 *   npm run dev
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GitVaultManager } from '@/services/git-vault-manager';
import { registerTools } from '@/mcp/tool-registrations';
import { loadEnv, ensureCoreEnvVars } from '@/env';
import { MCP_SERVER_INSTRUCTIONS } from '@/server/shared/instructions';

loadEnv();

try {
  ensureCoreEnvVars();
} catch (error: any) {
  console.error('Invalid environment configuration: %s', error.message);
  console.error('Create a .env file (see .env.example) or export variables.');
  process.exit(1);
}

const LOCAL_VAULT_PATH = process.env.LOCAL_VAULT_PATH || './vault-local';

const vaultManager = new GitVaultManager({
  repoUrl: process.env.VAULT_REPO!,
  branch: process.env.VAULT_BRANCH!,
  githubPat: process.env.GITHUB_PAT!,
  vaultPath: LOCAL_VAULT_PATH,
});

const mcpServer = new McpServer({
  name: 'obsidian-mcp',
  version: '1.0.0',
  instructions: MCP_SERVER_INSTRUCTIONS,
});

console.error('Starting Obsidian MCP Server (local mode)...');
console.error(`Vault path: ${LOCAL_VAULT_PATH}`);

registerTools(mcpServer, () => vaultManager);

const transport = new StdioServerTransport();
await mcpServer.connect(transport);

console.error('MCP Server running on stdio');
console.error('Ready to accept requests from MCP clients');

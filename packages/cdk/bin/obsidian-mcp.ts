#!/usr/bin/env node
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Recursively search up the directory tree for a .env file
 * @param startDir Directory to start searching from
 * @returns Path to .env file if found, undefined otherwise
 */
function findEnvFile(startDir: string): string | undefined {
  let currentDir = startDir;

  while (true) {
    const envPath = join(currentDir, '.env');

    if (existsSync(envPath)) {
      return envPath;
    }

    const parentDir = dirname(currentDir);

    // Reached filesystem root
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

// Recursively search for .env file
const envPath = findEnvFile(__dirname);
if (envPath) {
  config({ path: envPath });
} else {
  config(); // Fallback to default behavior
}

import 'source-map-support/register.js';
import * as cdk from 'aws-cdk-lib';
import { ObsidianMcpStack } from '../lib/obsidian-mcp-stack.js';

const app = new cdk.App();

new ObsidianMcpStack(app, 'ObsidianMcpStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? process.env.AWS_ACCOUNT_ID ?? undefined,
    region:
      app.node.tryGetContext('AWS_REGION') ??
      process.env.CDK_DEFAULT_REGION ??
      process.env.AWS_REGION ??
      'us-east-1',
  },
  description: 'MCP server for Obsidian vaults with git sync',
});

app.synth();

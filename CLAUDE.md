# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An MCP (Model Context Protocol) server that provides LLM access to git-backed Obsidian vaults. The server supports three deployment modes: stdio (local), HTTP (local with OAuth), and AWS Lambda (remote with OAuth + DynamoDB).

## Workspace Structure

This is an npm workspace monorepo with two packages:

- `packages/app` - Core MCP server implementation (stdio, HTTP, Lambda handlers)
- `packages/cdk` - AWS CDK infrastructure stack for Lambda deployment

## Development Commands

### Building

```bash
# Build everything (TypeScript + all bundles)
npm run build

# Build specific bundles
npm run build:app     # All app bundles
npm run build:lambda  # Lambda bundle only
npm run build:cdk     # CDK infrastructure

# Clean build artifacts
npm run clean
```

### Running Locally

```bash
# Stdio mode (for Claude Desktop, Cursor)
npm run dev

# HTTP mode with OAuth (for ChatGPT, remote clients)
npm run dev:http
```

### Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Linting & Formatting

```bash
# Lint TypeScript files
npm run lint
npm run lint:fix

# Format all files
npm run format
npm run format:check
```

### AWS Deployment

```bash
# Synthesize CloudFormation template
npm run cdk:synth

# Deploy to AWS
npm run cdk:deploy

# Destroy stack
npm run cdk:destroy
```

## Architecture

### Core Concepts

**VaultManager Interface**: Abstract interface for vault operations (read, write, delete, move files). Implemented by `GitVaultManager` which handles git clone/pull/commit/push automatically.

**Transport Modes**: The MCP server supports two transports selected at runtime:

- **Stdio**: Standard input/output for local MCP clients (no OAuth)
- **HTTP**: Streamable HTTP with OAuth 2.0 for remote access

**Three Server Implementations**:

1. `packages/app/src/server/local/stdio.ts` - Local stdio mode with pre-configured credentials
2. `packages/app/src/server/local/http.ts` - Local HTTP mode with in-memory session storage
3. `packages/app/src/server/lambda/index.ts` - Lambda handler with DynamoDB session storage

### Key Files

**MCP Tool Registration**: `packages/app/src/mcp/tool-registrations.ts` - Registers all 16 MCP tools with the server. Each tool is annotated with hints (readOnlyHint, destructiveHint, idempotentHint, openWorldHint).

**Tool Definitions**: `packages/app/src/mcp/tool-definitions.ts` - Zod schemas for input/output validation of all tools.

**Tool Handlers**: `packages/app/src/mcp/handlers/` - Implementation of tool logic organized by category (file-handlers.ts, directory-handlers.ts, search-handlers.ts, tag-handlers.ts, journal-handlers.ts).

**Resource Registration**: `packages/app/src/mcp/resource-registrations.ts` - Registers the vault README resource for on-demand access to vault organization guidelines.

**GitVaultManager**: `packages/app/src/services/git-vault-manager.ts` - Manages git operations with automatic clone/pull on initialization and commit/push after every write operation. Uses authenticated URLs with embedded PAT credentials.

**Auth Stores**: `packages/app/src/services/auth/stores/` - Provides both in-memory (in-memory-store.ts) and DynamoDB (dynamodb-store.ts) implementations of OAuth session storage.

**Environment Loading**: `packages/app/src/env.ts` - Recursively searches up the directory tree for .env files. Validates CORE_ENV_VARS (for stdio mode) and OAUTH_ENV_VARS (for HTTP/Lambda modes).

### Git Workflow

All write operations automatically commit and push to git:

1. `initialize()` - Clones vault (if not exists) or syncs with remote (fetch + reset --hard to match remote exactly)
2. Write operation executes
3. `commitAndPush()` - Stages affected files, commits with descriptive message, pushes with exponential backoff retry (max 3 attempts)
4. Obsidian clients pull changes to sync

Note: The vault is synced on every invocation to ensure consistency with the remote repository.

### OAuth Architecture

HTTP and Lambda modes use OAuth 2.0 Authorization Code Flow with PKCE:

- Authorization endpoint: `/oauth/authorize` - User logs in with PERSONAL_AUTH_TOKEN
- Token endpoint: `/oauth/token` - Exchanges auth code for access token
- Registration endpoint: `/oauth/register` - Creates OAuth session
- MCP endpoint: `/mcp` - Requires Bearer token in Authorization header

Session storage:

- Local HTTP: In-memory (lost on restart)
- Lambda: DynamoDB with TTL-based expiration

### Lambda-Specific Details

**Cold Start Optimization**: Lambda uses `/tmp/obsidian-vault` for git cache persistence across warm starts. First invocation clones, subsequent invocations reuse cached vault.

**Cache Management**: `packages/app/src/server/lambda/cache.ts` detects cold vs warm starts and cleans up old cache files after the first invocation.

**Bundling**: Lambda uses esbuild to bundle into a single CJS file with all dependencies included (no node_modules).

**Infrastructure**: CDK stack provisions:

- Lambda function with Docker image build (ARM64, 2GB memory, 10GB ephemeral storage)
- DynamoDB table for session storage with TTL
- Function URL with CORS enabled
- CloudWatch log group with 1-week retention

## Environment Variables

Required for all modes (CORE_ENV_VARS):

- `VAULT_REPO` - Git repository URL
- `VAULT_BRANCH` - Branch name (typically `main`)
- `GITHUB_PAT` - Personal Access Token with `repo` scope
- `JOURNAL_PATH_TEMPLATE` - Path template with `{{date}}` placeholder
- `JOURNAL_DATE_FORMAT` - Date format for template expansion
- `JOURNAL_ACTIVITY_SECTION` - Heading for journal entries
- `JOURNAL_FILE_TEMPLATE` - Template file for new journals

Additional for HTTP/Lambda modes (OAUTH_ENV_VARS):

- `OAUTH_CLIENT_ID` - OAuth client identifier
- `OAUTH_CLIENT_SECRET` - OAuth client secret (generate with crypto.randomBytes)
- `PERSONAL_AUTH_TOKEN` - User password for OAuth login (generate with crypto.randomBytes)
- `BASE_URL` - Server URL for OAuth callbacks

Optional:

- `LOCAL_VAULT_PATH` - Local vault directory (default: `./vault-local`)
- `PORT` - HTTP server port (default: `3000`)
- `SESSION_EXPIRY_MS` - Session lifetime (default: `86400000` = 24 hours)
- `AWS_REGION` - AWS region (default: `us-east-1`)

## Tool Categories

The server provides 16 tools organized into 5 categories:

**File Operations (7 tools)**: read-note, create-note, edit-note, delete-note, move-note, append-content, patch-content

**Directory Operations (3 tools)**: create-directory, list-files-in-vault, list-files-in-dir

**Search (1 tool)**: search-vault (regex support, context lines, file type filtering)

**Tag Management (4 tools)**: add-tags, remove-tags, rename-tag, manage-tags

**Journal Logging (1 tool)**: log-journal-entry (auto-log LLM activity to daily journals)

## Common Patterns

### Adding a New Tool

1. Define Zod schema in `tool-definitions.ts` (inputSchema, outputSchema)
2. Implement handler in the appropriate file under `handlers/` (e.g., `file-handlers.ts` for file operations) returning `ToolResponse` type
3. Export the handler from `handlers/index.ts`
4. Register tool in `tool-registrations.ts` with appropriate annotations
5. Update README.md tool count if adding a new category

### Testing Changes

Always test stdio mode first (fastest iteration):

```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Test with MCP inspector or Claude Desktop
```

For HTTP/OAuth testing:

```bash
# Start HTTP server
npm run dev:http

# Use ngrok for remote testing
ngrok http 3000
# Update BASE_URL in .env and restart server
```

### Working with Git Operations

All VaultManager write operations (writeFile, deleteFile, moveFile) automatically commit and push. Never manually call git commands - the GitVaultManager handles this. If you need to modify commit behavior, edit the `commitAndPush()` method in `packages/app/src/services/git-vault-manager.ts`.

### CDK Deployment Workflow

1. Ensure `.env` has all required variables (including OAUTH variables)
2. CDK reads from both process.env and CDK context (e.g., `-c KEY=value`)
3. Lambda uses Docker build for bundling (see `packages/app/Dockerfile.lambda`)
4. Function URL is automatically created with CORS enabled
5. Update BASE_URL to the Lambda Function URL and redeploy

## TypeScript Configuration

The project uses TypeScript 5.7+ with path aliases:

- `@/` maps to `packages/app/src/`

Main tsconfig files:

- `tsconfig.base.json` - Shared compiler options
- `tsconfig.json` - Root project references
- `packages/app/tsconfig.json` - App package config
- `packages/cdk/tsconfig.json` - CDK package config

## Important Notes

- **Tests**: The project uses Vitest for testing. Test files are located in `packages/app/tests/` with both behavior tests (e.g., files.spec.ts, directories.spec.ts, search.spec.ts, tags.spec.ts, journal.spec.ts, patch-content.spec.ts, error-handling.spec.ts) and unit tests (e.g., journal-formatter.spec.ts). Use `packages/app/tsconfig.test.json` when adding new tests.

- **Git Credentials**: GitHub PAT is embedded in git URLs as `https://x-access-token:PAT@github.com/...` for authentication. Never log the full URL.

- **Session Security**: PERSONAL_AUTH_TOKEN should be a cryptographically secure random value, not a simple password.

- **Lambda Timeouts**: Current timeout is 60 seconds. Large vault operations (initial clone, many files) may approach this limit.

- **DynamoDB Sessions**: Session table uses RETAIN removal policy - manually delete the table after stack destruction if needed.

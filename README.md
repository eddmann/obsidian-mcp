# Obsidian MCP Server

A Model Context Protocol (MCP) server for git-backed Obsidian vaults. Access and manage your notes through Claude, ChatGPT, and other LLMs by syncing changes via git.

[![Node.js 22+](https://img.shields.io/badge/node.js-22+-green.svg)](https://nodejs.org/)

## Overview

This MCP server provides **16 tools** and **1 resource** to interact with your Obsidian vault:

**Tools** (organized into 5 categories):

- File Operations (7 tools) - Read, create, edit, delete, move, append, and patch notes
- Directory Operations (3 tools) - Create directories and list files
- Search (1 tool) - Full-text search with regex support
- Tag Management (4 tools) - Add, remove, rename, and manage tags
- Journal Logging (1 tool) - Auto-log LLM activity to daily journals

**Resources**:

- Vault README - On-demand access to vault organization guidelines and structure

**Deployment Options (all single-user):**

- **Stdio Mode**: Local deployment (e.g., Claude Desktop, Cursor)
- **HTTP Mode**: Local HTTP deployment with OAuth (e.g., local MCP clients)
- **AWS Lambda**: Remote HTTP deployment with OAuth and DynamoDB session persistence (e.g., ChatGPT, remote MCP deployment)

## How It Works

This server is designed for **git-backed Obsidian vaults** managed by plugins like [obsidian-git](https://github.com/Vinzent03/obsidian-git). The workflow:

1. **Pull** - Server clones/pulls your vault from a git repository
2. **Modify** - LLM makes changes through MCP tools (create notes, add tags, etc.)
3. **Push** - Server automatically commits and pushes changes back to git
4. **Sync** - Your Obsidian clients pull changes to reflect updates

This enables LLM access to your vault without Obsidian being open, and keeps all clients synchronized through git.

## Prerequisites

- Node.js 22+ and npm

## Git-based Vault Setup

Before using this server, ensure your Obsidian vault is:

1. **Git-initialized** - Your vault must be a git repository
2. **Pushed to remote** - Hosted on GitHub, GitLab, or similar
3. **Sync-enabled** - We recommend [obsidian-git](https://github.com/Vinzent03/obsidian-git) plugin for automatic sync

The server will clone your vault, make changes, and push them back. Your Obsidian clients should regularly pull to stay in sync.

### Creating a GitHub Personal Access Token

You'll need a PAT with `repo` scope to authenticate git operations:

1. Go to https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes: `repo` (all)
4. Copy token and save securely - you'll use it during setup

### Required GitHub Scopes

The server requires these GitHub permissions:

- `repo` (all) - Full control of private repositories for read/write/push operations

## Installation & Setup

### How Authentication Works

#### Stdio Mode (single-user, pre-configured)

1. Git Credentials - GitHub PAT configured in `.env` file
2. Vault Access - Server clones vault using PAT on startup
3. Auto-Sync - Changes automatically committed and pushed to git
4. Persistence - Credentials persist across runs via `.env`

#### HTTP Mode (single-user, OAuth)

1. OAuth Flow - User authorization through personal auth token (MCP OAuth → Git Access)
2. Git Credentials - GitHub PAT stored in environment/session
3. Session Storage - Sessions stored in-memory (local) or DynamoDB (Lambda)
4. Auto-Sync - Changes committed/pushed per-session
5. Persistence - Sessions expire after configured timeout (default: 24 hours)

```bash
# Clone and install
git clone https://github.com/eddmann/obsidian-mcp
cd obsidian-mcp
npm install
```

Then configure credentials:

```bash
# Copy example env template
cp .env.example .env

# Edit .env and fill in required fields
```

This repository uses npm workspaces:

- `packages/app` – runtime server code (local stdio/http + Lambda handler)
- `packages/cdk` – AWS infrastructure stack

**Required for all modes:**

- `VAULT_REPO` - Your git repository URL
- `VAULT_BRANCH` - Branch to use (typically `main`)
- `GITHUB_PAT` - Personal access token with `repo` scope
- `JOURNAL_PATH_TEMPLATE` - Journal path template (e.g., `journal/{{date}}.md`)
- `JOURNAL_DATE_FORMAT` - Date format for journal entries (e.g., `YYYY-MM-DD`)
- `JOURNAL_ACTIVITY_SECTION` - Heading for journal entries (e.g., `## Journal`)
- `JOURNAL_FILE_TEMPLATE` - Template file for new journal entries (e.g., `Templates/Daily Note.md`)

**Required for HTTP/OAuth mode only:**

- `OAUTH_CLIENT_ID` - OAuth client identifier (default: `obsidian-mcp-client`)
- `OAUTH_CLIENT_SECRET` - OAuth client secret (generate with crypto, see below)
- `PERSONAL_AUTH_TOKEN` - Your personal login password (generate with crypto, see below)
- `BASE_URL` - Server URL (e.g., `http://localhost:3000` or Lambda URL)

**Optional:**

- `LOCAL_VAULT_PATH` - Local vault directory path (default: `./vault-local`)
- `PORT` - HTTP server port for local development (default: `3000`)
- `AWS_REGION` - AWS region for CDK deployment (default: `us-east-1`)
- `SESSION_EXPIRY_MS` - Session lifetime in milliseconds (default: `86400000` = 24 hours)

**Generate secure secrets** (for HTTP/OAuth mode):

```bash
# OAuth client secret (shared with MCP clients)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Personal auth token (your login password)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Transport Modes

The server supports two transport modes selected via runtime configuration (stdio is default for local development):

### Stdio Mode (Default)

Uses standard input/output for communication with a single pre-configured vault.

- Authentication: Pre-configured GitHub PAT and vault settings in `.env` file
- Users: Single user per deployment
- Setup: Configure `.env` once, credentials persist across runs
- Token Storage: Local `.env` file
- Best for: Claude Desktop, Cursor, local MCP clients

### HTTP Mode (Streamable HTTP)

Uses HTTP transport with OAuth for secure remote access.

- Authentication: OAuth 2.0 with personal token login (MCP OAuth → Git Access)
- Users: Single user (vault owner) with session-based access
- Setup: Environment-based configuration + OAuth secrets
- Token Storage: In-memory (local HTTP) or DynamoDB (Lambda)
- Session Lifetime: Configurable (default: 24 hours)
- Best for: ChatGPT, Claude web, remote deployments, AWS Lambda

## Claude Desktop Configuration

Add to your configuration file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

### Using Built Version

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/obsidian-mcp/dist/app/server/local/stdio.js"]
    }
  }
}
```

### Using tsx (no build needed)

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["tsx", "/ABSOLUTE/PATH/TO/obsidian-mcp/packages/app/src/server/local/stdio.ts"]
    }
  }
}
```

## ChatGPT Integration & HTTP Mode

### Running in HTTP Mode

Start the server in HTTP mode for remote deployment:

```bash
# Local development
npm run dev:http

# Or build and run
npm run build
node dist/app/server/local/http.js
```

Environment variables can be configured in your `.env` file (see Installation & Setup above).

### Local Development with ngrok

To test ChatGPT integration locally:

1. **Start the server in HTTP mode**:

   ```bash
   npm run dev:http
   ```

2. **In a separate terminal, expose via ngrok**:

   ```bash
   ngrok http 3000
   ```

3. **Update environment**: Set `BASE_URL` to your ngrok URL:

   ```bash
   export BASE_URL=https://abc123.ngrok.io
   ```

   Or add to your `.env` file:

   ```
   BASE_URL=https://abc123.ngrok.io
   ```

4. **Restart the server** to pick up the new base URL

5. **Configure ChatGPT**: Use the ngrok URL (with `/mcp` path) as your MCP server endpoint

## Usage

Ask Claude to interact with your Obsidian vault using natural language.

### File Operations

```
"Read my daily note for today"
"Create a new note called 'Meeting Notes' in the Work folder"
"Append my todo list to today's note"
"Add a new section under the '## Ideas' heading in my brainstorm note"
"Move 'draft.md' to the Archive folder"
"Delete my old scratch notes"
```

### Directory Operations

```
"Create a new folder called 'Projects/New Project'"
"List all markdown files in my vault"
"Show me what's in the Archive directory"
```

### Search

```
"Search for all notes mentioning 'machine learning'"
"Find notes with TODO items"
"Search for notes about 'project alpha' and show context"
```

### Tag Management

```
"Add tags #work and #important to my meeting note"
"Remove the #draft tag from all notes"
"Rename the tag #todo to #task across my vault"
"Show me all tags and their usage counts"
```

### Journal Logging

```
"Log this conversation to my journal: we discussed MCP server setup"
"Add a journal entry about today's coding work on the Obsidian project"
```

The journal tool automatically creates/appends to daily journal files with timestamps, activity types, and project linking.

## Available Tools

### File Operations (7 tools)

| Tool             | Description                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------- |
| `read-note`      | Read the contents of a note file                                                         |
| `create-note`    | Create a new note with content (commits/pushes to git)                                   |
| `edit-note`      | Replace entire note content                                                              |
| `delete-note`    | Delete a note file (with confirmation)                                                   |
| `move-note`      | Move or rename a note                                                                    |
| `append-content` | Append content to existing or new file                                                   |
| `patch-content`  | Insert content at specific location (heading, block ID, line number, or frontmatter key) |

### Directory Operations (3 tools)

| Tool                  | Description                                         |
| --------------------- | --------------------------------------------------- |
| `create-directory`    | Create new directories (with recursive option)      |
| `list-files-in-vault` | List all files in vault root with filtering options |
| `list-files-in-dir`   | List files in a specific directory                  |

### Search (1 tool)

| Tool           | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `search-vault` | Full-text search with regex support, context lines, and file type filtering |

### Tag Management (4 tools)

| Tool          | Description                                                  |
| ------------- | ------------------------------------------------------------ |
| `add-tags`    | Add tags to a note (frontmatter or inline)                   |
| `remove-tags` | Remove tags from a note                                      |
| `rename-tag`  | Rename a tag across all notes in vault (with dry-run option) |
| `manage-tags` | List all tags, count usage, or merge duplicate tags          |

### Journal Logging (1 tool)

| Tool                | Description                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `log-journal-entry` | Automatically log activity to daily journal with timestamps, activity type, summary, topics, outputs, and project linking |

## Available Resources

MCP resources provide contextual information that LLMs can access on-demand without loading the data upfront.

### Vault README

| Resource       | URI                       | Description                                                                                                                                          |
| -------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vault-readme` | `obsidian://vault-readme` | Provides access to the README.md file from your vault root containing organization guidelines, structure information, and vault-specific conventions |

**Usage**: If your vault contains a README.md file in its root directory, LLMs can access it through this resource to understand how your vault is organized. This helps the LLM make better decisions about where to create files, how to structure notes, and follow your vault's conventions.

**Example vault README.md**:

```markdown
# My Vault Organization

## Folder Structure

- `/Projects/` - Active project notes
- `/Archive/` - Completed projects
- `/Daily/` - Daily notes and journals
- `/Templates/` - Note templates

## Conventions

- Use YAML frontmatter for metadata
- Tag projects with #project/name
- Link related notes with [[wikilinks]]
```

## Development

```bash
# Install dependencies
npm install

# Run in stdio mode (for Claude Desktop)
npm run dev

# Run in HTTP mode with OAuth (for testing with curl or ChatGPT)
npm run dev:http

# Build TypeScript + Lambda bundle
npm run build

# Synthesize infrastructure (builds lambda bundle first)
npm run cdk:synth

# Deploy to AWS via CDK
npm run cdk:deploy

# Destroy the stack when done
npm run cdk:destroy
```

## License

MIT

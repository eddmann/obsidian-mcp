import { registerTools } from '@/mcp/tool-registrations';
import { VaultManager } from '@/services/vault-manager';
import { InMemoryVaultManager } from '../doubles/in-memory-vault-manager.js';

type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
}>;

class FakeMcpServer {
  tools = new Map<string, ToolHandler>();

  registerTool(
    name: string,
    _definition: unknown,
    handler: (args: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.tools.set(name, handler as ToolHandler);
  }
}

interface ToolHarnessOptions {
  vault?: InMemoryVaultManager;
  env?: Record<string, string>;
}

export class ToolHarness {
  readonly vault: InMemoryVaultManager;
  private server = new FakeMcpServer();
  private envBackup: Map<string, string | undefined> = new Map();

  constructor(options: ToolHarnessOptions = {}) {
    // Create vault with default journal template if not provided
    const defaultTemplate = 'Templates/Daily Note.md';
    const templateContent = `---
date: {{date}}
tags: [journal]
---

# {{date}}

## Journal

`;

    // If vault is provided, use it as-is; otherwise create a new one with the template
    this.vault =
      options.vault ??
      new InMemoryVaultManager({
        [defaultTemplate]: templateContent,
      });

    this.applyEnv({
      BASE_URL: 'http://localhost',
      JOURNAL_PATH_TEMPLATE: 'Journal/{{date}}.md',
      JOURNAL_ACTIVITY_SECTION: '## Journal',
      JOURNAL_DATE_FORMAT: 'yyyy-MM-dd',
      JOURNAL_FILE_TEMPLATE: 'Templates/Daily Note.md',
      OAUTH_CLIENT_ID: 'test-client',
      OAUTH_CLIENT_SECRET: 'secret',
      PERSONAL_AUTH_TOKEN: 'token',
      VAULT_REPO: 'https://example.com/repo.git',
      VAULT_BRANCH: 'main',
      GIT_TOKEN: 'test_token',
      ...options.env,
    });

    registerTools(
      this.server as unknown as { registerTool: FakeMcpServer['registerTool'] },
      () => this.vault as VaultManager,
    );
  }

  async invoke<TArgs extends Record<string, unknown> = Record<string, unknown>>(
    toolName: string,
    args: TArgs,
  ): Promise<{
    formatted: Awaited<ReturnType<ToolHandler>>;
    success: boolean;
    data: unknown;
    text: string;
  }> {
    const handler = this.server.tools.get(toolName);
    if (!handler) {
      throw new Error(`Tool ${toolName} not registered`);
    }

    const formatted = await handler(args);
    const text = formatted.content[0]?.text ?? '';

    if (formatted.structuredContent) {
      return {
        formatted,
        success: true,
        data: formatted.structuredContent,
        text,
      };
    }

    return {
      formatted,
      success: false,
      data: { error: text },
      text,
    };
  }

  restoreEnv(): void {
    for (const [key, value] of this.envBackup.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    this.envBackup.clear();
  }

  dispose(): void {
    this.restoreEnv();
  }

  private applyEnv(env: Record<string, string>): void {
    for (const [key, value] of Object.entries(env)) {
      if (!this.envBackup.has(key)) {
        this.envBackup.set(key, process.env[key]);
      }
      process.env[key] = value;
    }
  }
}

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VaultManager } from '@/services/vault-manager';

/**
 * Register MCP resources with the server
 *
 * Resources provide contextual information about the vault that LLMs can
 * reference when needed, without loading the data upfront.
 */
export function registerResources(server: McpServer, getVaultManager: () => VaultManager): void {
  server.registerResource(
    'vault-readme',
    'obsidian://vault-readme',
    {
      name: 'Vault README',
      description:
        'README.md from the vault root containing vault organization guidelines and structure',
      mimeType: 'text/markdown',
      annotations: {
        readOnlyHint: true,
        openWorldHint: true, // Interacts with git-backed vault
      },
    },
    async uri => {
      const vault = getVaultManager();

      try {
        // Check if README.md exists in vault root
        const readmeExists = await vault.fileExists('README.md');

        if (!readmeExists) {
          return {
            contents: [
              {
                uri: uri.href,
                mimeType: 'text/markdown',
                text: 'No README.md found in vault root.',
              },
            ],
          };
        }

        // Read the README content
        const content = await vault.readFile('README.md');

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: content,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error reading README.md';

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/markdown',
              text: `Error reading vault README: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );
}

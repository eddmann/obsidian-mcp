import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { VaultManager } from '@/services/vault-manager';
import * as toolDefs from '@/mcp/tool-definitions';
import * as handlers from '@/mcp/handlers';
import type { ToolResponse } from '@/mcp/handlers';

type McpToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
};

function formatToolResult(result: ToolResponse): McpToolResult {
  const contentText = result.success
    ? JSON.stringify(result.data ?? {}, null, 2)
    : (result.error ?? 'Unknown error');

  const response: McpToolResult = {
    content: [{ type: 'text', text: contentText }],
  };

  if (result.success && result.data !== undefined) {
    response.structuredContent =
      typeof result.data === 'object' && result.data !== null
        ? (result.data as Record<string, unknown>)
        : { value: result.data };
  }

  return response;
}

export function registerTools(server: McpServer, getVaultManager: () => VaultManager): void {
  server.registerTool(
    'read-note',
    {
      title: 'Read Note',
      description: 'Read the contents of a note file',
      inputSchema: toolDefs.ReadNoteSchema.inputSchema,
      outputSchema: toolDefs.ReadNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true, // Interacts with git-backed vault
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleReadNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'create-note',
    {
      title: 'Create Note',
      description: 'Create a new note with content',
      inputSchema: toolDefs.CreateNoteSchema.inputSchema,
      outputSchema: toolDefs.CreateNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // Additive operation
        idempotentHint: false, // Fails if file exists (unless overwrite)
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleCreateNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'edit-note',
    {
      title: 'Edit Note',
      description: 'Replace the entire content of a note',
      inputSchema: toolDefs.EditNoteSchema.inputSchema,
      outputSchema: toolDefs.EditNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Replaces entire content
        idempotentHint: true, // Same content = same result
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleEditNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'delete-note',
    {
      title: 'Delete Note',
      description: 'Delete a note file',
      inputSchema: toolDefs.DeleteNoteSchema.inputSchema,
      outputSchema: toolDefs.DeleteNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Permanently removes file
        idempotentHint: true, // Deleting same file twice has no effect
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleDeleteNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'move-note',
    {
      title: 'Move Note',
      description: 'Move or rename a note',
      inputSchema: toolDefs.MoveNoteSchema.inputSchema,
      outputSchema: toolDefs.MoveNoteSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Removes file from original location
        idempotentHint: true, // Moving to same destination has no effect
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleMoveNote(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'append-content',
    {
      title: 'Append Content',
      description: 'Append content to an existing or new file',
      inputSchema: toolDefs.AppendContentSchema.inputSchema,
      outputSchema: toolDefs.AppendContentSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // Additive operation
        idempotentHint: false, // Each append adds new content
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const config = {
        journalPathTemplate: process.env.JOURNAL_PATH_TEMPLATE!,
        journalActivitySection: process.env.JOURNAL_ACTIVITY_SECTION!,
        journalFileTemplate: process.env.JOURNAL_FILE_TEMPLATE!,
      };
      const result = await handlers.handleAppendContent(vault, args, config);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'patch-content',
    {
      title: 'Patch Content',
      description: 'Insert content at a specific location (heading, line, block, or frontmatter)',
      inputSchema: toolDefs.PatchContentSchema.inputSchema,
      outputSchema: toolDefs.PatchContentSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // Depends on position (before/after = additive, replace = destructive)
        idempotentHint: false, // Multiple patches can accumulate
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const config = {
        journalPathTemplate: process.env.JOURNAL_PATH_TEMPLATE!,
        journalActivitySection: process.env.JOURNAL_ACTIVITY_SECTION!,
        journalFileTemplate: process.env.JOURNAL_FILE_TEMPLATE!,
      };
      const result = await handlers.handlePatchContent(vault, args, config);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'create-directory',
    {
      title: 'Create Directory',
      description: 'Create a new directory in the vault',
      inputSchema: toolDefs.CreateDirectorySchema.inputSchema,
      outputSchema: toolDefs.CreateDirectorySchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // Additive operation
        idempotentHint: true, // Creating existing directory has no effect
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleCreateDirectory(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'list-files-in-vault',
    {
      title: 'List Files in Vault',
      description: 'List all files in the vault root',
      inputSchema: toolDefs.ListFilesInVaultSchema.inputSchema,
      outputSchema: toolDefs.ListFilesInVaultSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleListFilesInVault(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'list-files-in-dir',
    {
      title: 'List Files in Directory',
      description: 'List files in a specific directory',
      inputSchema: toolDefs.ListFilesInDirSchema.inputSchema,
      outputSchema: toolDefs.ListFilesInDirSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleListFilesInDir(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'search-vault',
    {
      title: 'Search Vault',
      description: 'Full-text search across the vault with context',
      inputSchema: toolDefs.SearchVaultSchema.inputSchema,
      outputSchema: toolDefs.SearchVaultSchema.outputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleSearchVault(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'add-tags',
    {
      title: 'Add Tags',
      description: 'Add tags to a note (frontmatter or inline)',
      inputSchema: toolDefs.AddTagsSchema.inputSchema,
      outputSchema: toolDefs.AddTagsSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // Additive operation
        idempotentHint: true, // Adding same tags has no effect
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleAddTags(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'remove-tags',
    {
      title: 'Remove Tags',
      description: 'Remove tags from a note',
      inputSchema: toolDefs.RemoveTagsSchema.inputSchema,
      outputSchema: toolDefs.RemoveTagsSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Removes metadata
        idempotentHint: true, // Removing non-existent tags has no effect
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleRemoveTags(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'rename-tag',
    {
      title: 'Rename Tag',
      description: 'Rename a tag across all notes in the vault',
      inputSchema: toolDefs.RenameTagSchema.inputSchema,
      outputSchema: toolDefs.RenameTagSchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true, // Replaces tags across multiple files
        idempotentHint: true, // Renaming to same name has no effect
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleRenameTag(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'manage-tags',
    {
      title: 'Manage Tags',
      description: 'List, count, or merge tags across the vault',
      inputSchema: toolDefs.ManageTagsSchema.inputSchema,
      outputSchema: toolDefs.ManageTagsSchema.outputSchema,
      annotations: {
        readOnlyHint: false, // Can merge tags (write operation)
        destructiveHint: false, // Depends on action (list/count = read-only, merge = destructive)
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const result = await handlers.handleManageTags(vault, args);
      return formatToolResult(result);
    },
  );

  server.registerTool(
    'log-journal-entry',
    {
      title: 'Log Journal Entry',
      description: "Automatically log work to today's journal entry",
      inputSchema: toolDefs.LogJournalEntrySchema.inputSchema,
      outputSchema: toolDefs.LogJournalEntrySchema.outputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // Appends to journal
        idempotentHint: false, // Each log creates unique timestamped entry
        openWorldHint: true,
      },
    },
    async args => {
      const vault = getVaultManager();
      const config = {
        journalPathTemplate: process.env.JOURNAL_PATH_TEMPLATE!,
        journalActivitySection: process.env.JOURNAL_ACTIVITY_SECTION!,
        journalFileTemplate: process.env.JOURNAL_FILE_TEMPLATE!,
      };
      const result = await handlers.handleLogJournalEntry(vault, args, config);
      return formatToolResult(result);
    },
  );
}

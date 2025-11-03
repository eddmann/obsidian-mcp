import { z } from 'zod';

export const ReadNoteSchema = {
  inputSchema: {
    path: z.string().describe('Path to the note file (e.g., "folder/note.md")'),
  },
  outputSchema: {
    content: z.string(),
    path: z.string(),
  },
};

export const CreateNoteSchema = {
  inputSchema: {
    path: z.string().describe('Path for the new note'),
    content: z.string().describe('Content of the note'),
    overwrite: z.boolean().optional().describe('Overwrite if file exists (default: false)'),
  },
  outputSchema: {
    success: z.boolean(),
    path: z.string(),
  },
};

export const EditNoteSchema = {
  inputSchema: {
    path: z.string().describe('Path to the note to edit'),
    content: z.string().describe('New content (replaces entire file)'),
  },
  outputSchema: {
    success: z.boolean(),
    path: z.string(),
  },
};

export const DeleteNoteSchema = {
  inputSchema: {
    path: z.string().describe('Path to the file to delete'),
    confirm: z.boolean().describe('Must be true to confirm deletion'),
  },
  outputSchema: {
    success: z.boolean(),
    path: z.string(),
  },
};

export const MoveNoteSchema = {
  inputSchema: {
    source_path: z.string().describe('Current path of the file'),
    destination_path: z.string().describe('New path for the file'),
    overwrite: z.boolean().optional().describe('Overwrite if destination exists (default: false)'),
  },
  outputSchema: {
    success: z.boolean(),
    source_path: z.string(),
    destination_path: z.string(),
  },
};

export const AppendContentSchema = {
  inputSchema: {
    path: z.string().describe('Path to the file'),
    content: z.string().describe('Content to append'),
    newline: z.boolean().optional().describe('Add newline before content (default: true)'),
    create_if_missing: z
      .boolean()
      .optional()
      .describe("Create file if it doesn't exist (default: true)"),
  },
  outputSchema: {
    success: z.boolean(),
    path: z.string(),
  },
};

export const PatchContentSchema = {
  inputSchema: {
    path: z.string().describe('Path to the file'),
    content: z.string().describe('Content to insert'),
    anchor_type: z
      .enum(['heading', 'block', 'frontmatter', 'line'])
      .describe('Type of anchor to insert at'),
    anchor_value: z
      .string()
      .describe('Heading name, block ID, frontmatter key, or 1-based line number'),
    position: z.enum(['before', 'after', 'replace']).describe('Where to insert relative to anchor'),
    create_if_missing: z.boolean().optional().describe('Create file if missing (default: true)'),
  },
  outputSchema: {
    success: z.boolean(),
    path: z.string(),
  },
};

export const CreateDirectorySchema = {
  inputSchema: {
    path: z.string().describe('Path for the new directory'),
    recursive: z.boolean().optional().describe('Create parent directories (default: true)'),
  },
  outputSchema: {
    success: z.boolean(),
    path: z.string(),
  },
};

export const ListFilesInVaultSchema = {
  inputSchema: {
    include_directories: z
      .boolean()
      .optional()
      .describe('Include directories in results (default: false)'),
    file_types: z
      .array(z.string())
      .optional()
      .describe('Filter by file extensions (e.g., ["md", "pdf"])'),
    recursive: z.boolean().optional().describe('List files recursively (default: true)'),
  },
  outputSchema: {
    files: z.array(z.string()),
    count: z.number(),
  },
};

export const ListFilesInDirSchema = {
  inputSchema: {
    path: z.string().describe('Directory path to list'),
    include_directories: z
      .boolean()
      .optional()
      .describe('Include directories in results (default: false)'),
    file_types: z.array(z.string()).optional().describe('Filter by file extensions'),
    recursive: z.boolean().optional().describe('List files recursively (default: true)'),
  },
  outputSchema: {
    files: z.array(z.string()),
    count: z.number(),
    directory: z.string(),
  },
};

export const SearchVaultSchema = {
  inputSchema: {
    query: z.string().describe('Search query string'),
    case_sensitive: z.boolean().optional().describe('Case-sensitive search (default: false)'),
    regex: z.boolean().optional().describe('Treat query as regex (default: false)'),
    path_filter: z.string().optional().describe('Filter results by path pattern'),
    file_types: z.array(z.string()).optional().describe('Filter by file extensions'),
    limit: z.number().optional().describe('Maximum number of results (default: 50)'),
    include_content: z
      .boolean()
      .optional()
      .describe('Include matching line content (default: true)'),
    context_lines: z
      .number()
      .optional()
      .describe('Number of context lines to include (default: 2)'),
  },
  outputSchema: {
    results: z.array(
      z.object({
        path: z.string(),
        matches: z.array(
          z.object({
            line: z.number(),
            content: z.string().optional(),
            context_before: z.array(z.string()).optional(),
            context_after: z.array(z.string()).optional(),
          }),
        ),
      }),
    ),
    total_matches: z.number(),
    total_files: z.number(),
  },
};

export const AddTagsSchema = {
  inputSchema: {
    path: z.string().describe('Path to the note'),
    tags: z.array(z.string()).describe('Tags to add (without # prefix)'),
    location: z
      .enum(['frontmatter', 'inline', 'both'])
      .optional()
      .describe('Where to add tags (default: "frontmatter")'),
    deduplicate: z.boolean().optional().describe('Remove duplicate tags (default: true)'),
  },
  outputSchema: {
    success: z.boolean(),
    path: z.string(),
    tags_added: z.array(z.string()),
  },
};

export const RemoveTagsSchema = {
  inputSchema: {
    path: z.string().describe('Path to the note'),
    tags: z.array(z.string()).describe('Tags to remove (without # prefix)'),
    location: z
      .enum(['frontmatter', 'inline', 'both'])
      .optional()
      .describe('Where to remove from (default: "both")'),
  },
  outputSchema: {
    success: z.boolean(),
    path: z.string(),
    tags_removed: z.array(z.string()),
  },
};

export const RenameTagSchema = {
  inputSchema: {
    old_tag: z.string().describe('Tag to rename (without # prefix)'),
    new_tag: z.string().describe('New tag name (without # prefix)'),
    case_sensitive: z.boolean().optional().describe('Case-sensitive matching (default: false)'),
    dry_run: z.boolean().optional().describe('Preview changes without applying (default: false)'),
  },
  outputSchema: {
    success: z.boolean(),
    files_affected: z.array(z.string()),
    total_replacements: z.number(),
    dry_run: z.boolean(),
  },
};

export const ManageTagsSchema = {
  inputSchema: {
    action: z.enum(['list', 'count', 'merge']).describe('Action to perform'),
    tag: z.string().optional().describe('Tag to operate on (for count)'),
    merge_into: z.string().optional().describe('Target tag for merge action'),
    sort_by: z.enum(['name', 'count']).optional().describe('Sort results by (default: "name")'),
    include_nested: z.boolean().optional().describe('Include nested tags (default: true)'),
  },
  outputSchema: {
    action: z.string(),
    tags: z
      .array(
        z.object({
          tag: z.string(),
          count: z.number(),
          files: z.array(z.string()).optional(),
        }),
      )
      .optional(),
    total_tags: z.number().optional(),
    merged: z
      .object({
        from: z.string(),
        into: z.string(),
        files_affected: z.number(),
      })
      .optional(),
  },
};

export const LogJournalEntrySchema = {
  inputSchema: {
    activity_type: z
      .enum(['development', 'research', 'writing', 'planning', 'learning', 'problem-solving'])
      .describe('Type of activity performed'),
    summary: z.string().describe('1-2 sentence summary of the work'),
    key_topics: z.array(z.string()).describe('2-4 main topics/technologies involved'),
    outputs: z.array(z.string()).optional().describe('Concrete deliverables or artifacts created'),
    project: z
      .string()
      .optional()
      .describe('Related project for linking (e.g., "Projects/Obsidian MCP")'),
  },
  outputSchema: {
    success: z.boolean(),
    journal_path: z.string(),
    entry_timestamp: z.string(),
  },
};

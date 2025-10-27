import { VaultManager } from '@/services/vault-manager';
import { formatJournalEntry } from '@/services/journal-formatter';

export interface ToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata: {
    timestamp: string;
    affected_files?: string[];
  };
}

// ========== FILE OPERATIONS ==========

export async function handleReadNote(
  vault: VaultManager,
  args: { path: string },
): Promise<ToolResponse> {
  try {
    const content = await vault.readFile(args.path);

    return {
      success: true,
      data: { content, path: args.path },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleCreateNote(
  vault: VaultManager,
  args: { path: string; content: string; overwrite?: boolean },
): Promise<ToolResponse> {
  try {
    const exists = await vault.fileExists(args.path);

    if (exists && !args.overwrite) {
      throw new Error(`File ${args.path} already exists. Set overwrite=true to replace it.`);
    }

    await vault.writeFile(args.path, args.content);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleEditNote(
  vault: VaultManager,
  args: { path: string; content: string },
): Promise<ToolResponse> {
  try {
    await vault.writeFile(args.path, args.content);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleDeleteNote(
  vault: VaultManager,
  args: { path: string; confirm: boolean },
): Promise<ToolResponse> {
  try {
    if (!args.confirm) {
      throw new Error('Must set confirm=true to delete file');
    }

    await vault.deleteFile(args.path);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleMoveNote(
  vault: VaultManager,
  args: { source_path: string; destination_path: string; overwrite?: boolean },
): Promise<ToolResponse> {
  try {
    const destExists = await vault.fileExists(args.destination_path);

    if (destExists) {
      if (!args.overwrite) {
        throw new Error(
          `Destination ${args.destination_path} already exists. Set overwrite=true to replace it.`,
        );
      }

      // deleteFile will throw if trying to delete a directory
      await vault.deleteFile(args.destination_path);
    }

    await vault.moveFile(args.source_path, args.destination_path);

    return {
      success: true,
      data: {
        success: true,
        source_path: args.source_path,
        destination_path: args.destination_path,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.source_path, args.destination_path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleAppendContent(
  vault: VaultManager,
  args: {
    path: string;
    content: string;
    newline?: boolean;
    create_if_missing?: boolean;
  },
  config?: JournalConfig,
): Promise<ToolResponse> {
  try {
    const exists = await vault.fileExists(args.path);
    const newline = args.newline !== false;
    const createIfMissing = args.create_if_missing !== false;

    if (!exists && !createIfMissing) {
      throw new Error(`File ${args.path} does not exist`);
    }

    // Use helper function to get or initialize content from template
    const currentContent = await getOrInitializeContent(vault, args.path, config);

    let newContent = currentContent;
    if (newline !== false && newContent.length > 0 && !newContent.endsWith('\n')) {
      newContent += '\n';
    }
    newContent += args.content;

    await vault.writeFile(args.path, newContent);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handlePatchContent(
  vault: VaultManager,
  args: {
    path: string;
    content: string;
    anchor_type: 'heading' | 'block' | 'frontmatter' | 'line';
    anchor_value: string;
    position: 'before' | 'after' | 'replace';
    create_if_missing?: boolean;
  },
  config?: JournalConfig,
): Promise<ToolResponse> {
  try {
    const exists = await vault.fileExists(args.path);
    const createIfMissing = args.create_if_missing !== false;

    if (!exists && !createIfMissing) {
      throw new Error(`File ${args.path} does not exist`);
    }

    // Use helper function to get or initialize content from template
    const currentContent = await getOrInitializeContent(vault, args.path, config);

    let newContent: string;

    switch (args.anchor_type) {
      case 'heading':
        newContent = patchAtHeading(currentContent, args.anchor_value, args.content, args.position);
        break;
      case 'line':
        newContent = patchAtLine(
          currentContent,
          parseInt(args.anchor_value),
          args.content,
          args.position,
        );
        break;
      case 'block':
        newContent = patchAtBlock(currentContent, args.anchor_value, args.content, args.position);
        break;
      case 'frontmatter':
        newContent = patchFrontmatter(currentContent, args.anchor_value, args.content);
        break;
      default:
        throw new Error(`Unknown anchor type: ${args.anchor_type}`);
    }

    await vault.writeFile(args.path, newContent);

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

// ========== DIRECTORY OPERATIONS ==========

export async function handleCreateDirectory(
  vault: VaultManager,
  args: { path: string; recursive?: boolean },
): Promise<ToolResponse> {
  try {
    const recursive = args.recursive !== false;
    await vault.createDirectory(args.path, recursive);

    const gitkeepPath = `${args.path}/.gitkeep`;
    await vault.writeFile(gitkeepPath, '');

    return {
      success: true,
      data: { success: true, path: args.path },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [gitkeepPath],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleListFilesInVault(
  vault: VaultManager,
  args: {
    include_directories?: boolean;
    file_types?: string[];
    recursive?: boolean;
  },
): Promise<ToolResponse> {
  try {
    const files = await vault.listFiles('', {
      includeDirectories: args.include_directories,
      fileTypes: args.file_types,
      recursive: args.recursive,
    });

    return {
      success: true,
      data: { files, count: files.length },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleListFilesInDir(
  vault: VaultManager,
  args: {
    path: string;
    include_directories?: boolean;
    file_types?: string[];
    recursive?: boolean;
  },
): Promise<ToolResponse> {
  try {
    const files = await vault.listFiles(args.path, {
      includeDirectories: args.include_directories,
      fileTypes: args.file_types,
      recursive: args.recursive,
    });

    return {
      success: true,
      data: {
        files,
        count: files.length,
        directory: args.path,
      },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

// ========== HELPER FUNCTIONS FOR PATCHING ==========

function patchAtHeading(
  content: string,
  heading: string,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): string {
  const lines = content.split('\n');
  const headingRegex = new RegExp(`^#+\\s+${escapeRegExp(heading)}\\s*$`, 'i');

  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i])) {
      if (position === 'before') {
        lines.splice(i, 0, newContent);
      } else if (position === 'after') {
        lines.splice(i + 1, 0, newContent);
      } else {
        // Find next heading and replace content between
        let endIndex = i + 1;
        while (endIndex < lines.length && !/^#+\s+/.test(lines[endIndex])) {
          endIndex++;
        }
        lines.splice(i + 1, endIndex - i - 1, newContent);
      }
      return lines.join('\n');
    }
  }

  throw new Error(`Heading "${heading}" not found`);
}

function patchAtLine(
  content: string,
  lineNumber: number,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): string {
  const lines = content.split('\n');

  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`Line ${lineNumber} out of range (1-${lines.length})`);
  }

  const index = lineNumber - 1;

  if (position === 'before') {
    lines.splice(index, 0, newContent);
  } else if (position === 'after') {
    lines.splice(index + 1, 0, newContent);
  } else {
    lines[index] = newContent;
  }

  return lines.join('\n');
}

function patchAtBlock(
  content: string,
  blockId: string,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): string {
  const lines = content.split('\n');
  const blockRegex = new RegExp(`\\^${escapeRegExp(blockId)}\\s*$`);

  for (let i = 0; i < lines.length; i++) {
    if (blockRegex.test(lines[i])) {
      if (position === 'before') {
        lines.splice(i, 0, newContent);
      } else if (position === 'after') {
        lines.splice(i + 1, 0, newContent);
      } else {
        lines[i] = newContent;
      }
      return lines.join('\n');
    }
  }

  throw new Error(`Block ID ^${blockId} not found`);
}

function patchFrontmatter(content: string, key: string, value: string): string {
  const lines = content.split('\n');

  if (lines[0] === '---') {
    let endIndex = 1;
    while (endIndex < lines.length && lines[endIndex] !== '---') {
      endIndex++;
    }

    const keyRegex = new RegExp(`^${escapeRegExp(key)}:\\s*`);
    for (let i = 1; i < endIndex; i++) {
      if (keyRegex.test(lines[i])) {
        lines[i] = `${key}: ${value}`;
        return lines.join('\n');
      }
    }

    lines.splice(endIndex, 0, `${key}: ${value}`);
  } else {
    lines.unshift('---', `${key}: ${value}`, '---', '');
  }

  return lines.join('\n');
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========== SEARCH ==========

export async function handleSearchVault(
  vault: VaultManager,
  args: {
    query: string;
    case_sensitive?: boolean;
    regex?: boolean;
    path_filter?: string;
    file_types?: string[];
    limit?: number;
    include_content?: boolean;
    context_lines?: number;
  },
): Promise<ToolResponse> {
  try {
    const caseSensitive = args.case_sensitive || false;
    const isRegex = args.regex || false;
    const limit = args.limit || 50;
    const includeContent = args.include_content !== false;
    const contextLines = args.context_lines || 2;

    const allFiles = await vault.listFiles('', {
      fileTypes: args.file_types || ['md'],
      recursive: true,
    });

    let filesToSearch = allFiles;
    if (args.path_filter) {
      const pathRegex = new RegExp(args.path_filter, caseSensitive ? '' : 'i');
      filesToSearch = allFiles.filter(f => pathRegex.test(f));
    }

    const searchPattern = isRegex ? args.query : escapeRegExp(args.query);
    const searchRegex = new RegExp(searchPattern, caseSensitive ? 'g' : 'gi');

    const results: any[] = [];
    let totalMatches = 0;
    const batchSize = 4;

    for (let i = 0; i < filesToSearch.length && results.length < limit; i += batchSize) {
      const batch = filesToSearch.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async filePath => {
          try {
            const content = await vault.readFile(filePath);
            const lines = content.split('\n');
            const matches: any[] = [];

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
              searchRegex.lastIndex = 0;
              if (searchRegex.test(lines[lineNum])) {
                const match: any = {
                  line: lineNum + 1,
                };

                if (includeContent) {
                  match.content = lines[lineNum];

                  if (contextLines > 0) {
                    match.context_before = [];
                    match.context_after = [];

                    for (let j = 1; j <= contextLines; j++) {
                      if (lineNum - j >= 0) {
                        match.context_before.unshift(lines[lineNum - j]);
                      }
                      if (lineNum + j < lines.length) {
                        match.context_after.push(lines[lineNum + j]);
                      }
                    }
                  }
                }

                matches.push(match);
              }
            }

            if (matches.length > 0) {
              return { path: filePath, matches };
            }

            return null;
          } catch (error) {
            console.warn(`Error searching ${filePath}:`, error);
            return null;
          }
        }),
      );

      for (const result of batchResults) {
        if (result && results.length < limit) {
          results.push(result);
          totalMatches += result.matches.length;
        }
      }
    }

    return {
      success: true,
      data: {
        results,
        total_matches: totalMatches,
        total_files: results.length,
      },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

// ========== TAG MANAGEMENT ==========

export async function handleAddTags(
  vault: VaultManager,
  args: {
    path: string;
    tags: string[];
    location?: 'frontmatter' | 'inline' | 'both';
    deduplicate?: boolean;
  },
): Promise<ToolResponse> {
  try {
    const location = args.location || 'frontmatter';
    const deduplicate = args.deduplicate !== false;
    const content = await vault.readFile(args.path);

    let newContent = content;
    const tagsAdded: string[] = [];

    if (location === 'frontmatter' || location === 'both') {
      newContent = addTagsToFrontmatter(newContent, args.tags, deduplicate);
      tagsAdded.push(...args.tags);
    }

    if (location === 'inline' || location === 'both') {
      const inlineResult = addInlineTags(newContent, args.tags, deduplicate);
      newContent = inlineResult.content;
      tagsAdded.push(...inlineResult.added);
    }

    await vault.writeFile(args.path, newContent);

    return {
      success: true,
      data: {
        success: true,
        path: args.path,
        tags_added: deduplicate ? [...new Set(tagsAdded)] : tagsAdded,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleRemoveTags(
  vault: VaultManager,
  args: {
    path: string;
    tags: string[];
    location?: 'frontmatter' | 'inline' | 'both';
  },
): Promise<ToolResponse> {
  try {
    const location = args.location || 'both';
    const content = await vault.readFile(args.path);

    let newContent = content;

    if (location === 'frontmatter' || location === 'both') {
      newContent = removeTagsFromFrontmatter(newContent, args.tags);
    }

    if (location === 'inline' || location === 'both') {
      newContent = removeInlineTags(newContent, args.tags);
    }

    await vault.writeFile(args.path, newContent);

    return {
      success: true,
      data: {
        success: true,
        path: args.path,
        tags_removed: args.tags,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: [args.path],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleRenameTag(
  vault: VaultManager,
  args: {
    old_tag: string;
    new_tag: string;
    case_sensitive?: boolean;
    dry_run?: boolean;
  },
): Promise<ToolResponse> {
  try {
    const caseSensitive = args.case_sensitive || false;
    const dryRun = args.dry_run || false;

    const allFiles = await vault.listFiles('', {
      fileTypes: ['md'],
      recursive: true,
    });

    const filesAffected: string[] = [];
    let totalReplacements = 0;

    for (const filePath of allFiles) {
      const content = await vault.readFile(filePath);

      if (content.includes(`#${args.old_tag}`)) {
        const newContent = content.replace(
          new RegExp(`#${escapeRegExp(args.old_tag)}\\b`, caseSensitive ? 'g' : 'gi'),
          `#${args.new_tag}`,
        );

        const matches = content.match(
          new RegExp(`#${escapeRegExp(args.old_tag)}\\b`, caseSensitive ? 'g' : 'gi'),
        );
        const count = matches?.length || 0;

        if (count > 0) {
          filesAffected.push(filePath);
          totalReplacements += count;

          if (!dryRun) {
            await vault.writeFile(filePath, newContent);
          }
        }
      }
    }

    return {
      success: true,
      data: {
        success: true,
        files_affected: filesAffected,
        total_replacements: totalReplacements,
        dry_run: dryRun,
      },
      metadata: {
        timestamp: new Date().toISOString(),
        affected_files: dryRun ? undefined : filesAffected,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

export async function handleManageTags(
  vault: VaultManager,
  args: {
    action: 'list' | 'count' | 'merge';
    tag?: string;
    merge_into?: string;
    sort_by?: 'name' | 'count';
    include_nested?: boolean;
  },
): Promise<ToolResponse> {
  try {
    const allFiles = await vault.listFiles('', {
      fileTypes: ['md'],
      recursive: true,
    });

    const tagCounts = new Map<string, Set<string>>();

    for (const filePath of allFiles) {
      const content = await vault.readFile(filePath);
      const tagMatches = content.matchAll(/#([\w/-]+)/g);

      for (const match of tagMatches) {
        const tag = match[1];
        if (!tagCounts.has(tag)) {
          tagCounts.set(tag, new Set());
        }
        tagCounts.get(tag)!.add(filePath);
      }
    }

    if (args.action === 'list' || args.action === 'count') {
      const tags = Array.from(tagCounts.entries()).map(([tag, files]) => ({
        tag,
        count: files.size,
        files: args.action === 'list' ? Array.from(files) : undefined,
      }));

      if (args.sort_by === 'count') {
        tags.sort((a, b) => b.count - a.count);
      } else {
        tags.sort((a, b) => a.tag.localeCompare(b.tag));
      }

      return {
        success: true,
        data: {
          action: args.action,
          tags,
          total_tags: tags.length,
        },
        metadata: { timestamp: new Date().toISOString() },
      };
    } else if (args.action === 'merge') {
      if (!args.tag || !args.merge_into) {
        throw new Error('merge action requires both tag and merge_into parameters');
      }

      const renameResult = await handleRenameTag(vault, {
        old_tag: args.tag,
        new_tag: args.merge_into,
        dry_run: false,
      });

      return {
        success: renameResult.success,
        data: {
          action: 'merge',
          merged: {
            from: args.tag,
            into: args.merge_into,
            files_affected: renameResult.data?.files_affected.length || 0,
          },
        },
        metadata: renameResult.metadata,
      };
    }

    throw new Error(`Unknown action: ${args.action}`);
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

// ========== TAG HELPER FUNCTIONS ==========

function addTagsToFrontmatter(content: string, tags: string[], deduplicate: boolean): string {
  const lines = content.split('\n');
  let frontmatterEnd = -1;

  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        frontmatterEnd = i;
        break;
      }
    }
  }

  if (frontmatterEnd === -1) {
    const tagLine = `tags: [${tags.join(', ')}]`;
    lines.unshift('---', tagLine, '---', '');
  } else {
    let tagsLineIndex = -1;
    for (let i = 1; i < frontmatterEnd; i++) {
      if (lines[i].trim().startsWith('tags:')) {
        tagsLineIndex = i;
        break;
      }
    }

    if (tagsLineIndex === -1) {
      lines.splice(frontmatterEnd, 0, `tags: [${tags.join(', ')}]`);
    } else {
      const existingTags = parseTagsFromLine(lines[tagsLineIndex]);
      const allTags = deduplicate
        ? [...new Set([...existingTags, ...tags])]
        : [...existingTags, ...tags];
      lines[tagsLineIndex] = `tags: [${allTags.join(', ')}]`;
    }
  }

  return lines.join('\n');
}

function removeTagsFromFrontmatter(content: string, tags: string[]): string {
  const lines = content.split('\n');
  let frontmatterEnd = -1;

  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        frontmatterEnd = i;
        break;
      }
    }
  }

  if (frontmatterEnd !== -1) {
    for (let i = 1; i < frontmatterEnd; i++) {
      if (lines[i].trim().startsWith('tags:')) {
        const existingTags = parseTagsFromLine(lines[i]);
        const remainingTags = existingTags.filter(t => !tags.includes(t));
        lines[i] = `tags: [${remainingTags.join(', ')}]`;
        break;
      }
    }
  }

  return lines.join('\n');
}

function addInlineTags(
  content: string,
  tags: string[],
  deduplicate: boolean,
): { content: string; added: string[] } {
  const existing = deduplicate
    ? new Set((content.match(/#([\w/-]+)/g) || []).map(tag => tag.slice(1)))
    : null;

  const tagsToAdd = deduplicate && existing ? tags.filter(tag => !existing.has(tag)) : [...tags];

  if (tagsToAdd.length === 0) {
    return { content, added: [] };
  }

  const lines = content.split('\n');

  // Find the first line in the body (after frontmatter) that contains inline tags
  let targetLineIndex = -1;
  let afterFrontmatter = false;

  for (let i = 0; i < lines.length; i++) {
    // Skip frontmatter
    if (i === 0 && lines[i] === '---') {
      afterFrontmatter = false;
      continue;
    }
    if (!afterFrontmatter && lines[i] === '---') {
      afterFrontmatter = true;
      continue;
    }
    if (!afterFrontmatter) continue;

    // Look for existing inline tags in body
    if (lines[i].includes('#')) {
      targetLineIndex = i;
      break;
    }
  }

  // If we found a line with tags, append to that line
  if (targetLineIndex >= 0) {
    lines[targetLineIndex] += ' ' + tagsToAdd.map(t => `#${t}`).join(' ');
  } else {
    // Otherwise append at the end
    const separator = content.endsWith('\n') ? '' : '\n';
    return {
      content: content + separator + tagsToAdd.map(t => `#${t}`).join(' '),
      added: tagsToAdd,
    };
  }

  return {
    content: lines.join('\n'),
    added: tagsToAdd,
  };
}

function removeInlineTags(content: string, tags: string[]): string {
  let result = content;
  for (const tag of tags) {
    result = result.replace(new RegExp(`#${escapeRegExp(tag)}\\b`, 'g'), '');
  }
  return result;
}

function parseTagsFromLine(line: string): string[] {
  const match = line.match(/tags:\s*\[(.*)\]/);
  if (!match) return [];

  return match[1]
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

// ========== JOURNAL LOGGING ==========

export interface JournalConfig {
  journalPathTemplate: string;
  journalActivitySection: string;
  journalFileTemplate: string;
}

/**
 * Helper function to get or initialize content for a file
 * If the file matches the journal path pattern and doesn't exist, initialize from template
 */
async function getOrInitializeContent(
  vault: VaultManager,
  path: string,
  config?: JournalConfig,
): Promise<string> {
  const exists = await vault.fileExists(path);

  if (exists) {
    return await vault.readFile(path);
  }

  // If no config provided, return empty content
  if (!config) {
    return '';
  }

  // Check if path matches journal path template pattern
  const templatePattern = config.journalPathTemplate.replace('{{date}}', '(\\d{4}-\\d{2}-\\d{2})');
  const regex = new RegExp('^' + templatePattern + '$');
  const match = path.match(regex);

  if (!match) {
    // Not a daily note, return empty content
    return '';
  }

  // Extract date from path
  const dateStr = match[1];

  // Read template file from vault
  const templateContent = await vault.readFile(config.journalFileTemplate);

  // Replace {{date}} placeholders with actual date
  return templateContent.replace(/\{\{date\}\}/g, dateStr);
}

export async function handleLogJournalEntry(
  vault: VaultManager,
  args: {
    activity_type:
      | 'development'
      | 'research'
      | 'writing'
      | 'planning'
      | 'learning'
      | 'problem-solving';
    summary: string;
    key_topics: string[];
    outputs?: string[];
    project?: string;
  },
  config: JournalConfig,
): Promise<ToolResponse> {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const journalPath = config.journalPathTemplate.replace('{{date}}', dateStr);

    // Use helper function to get or initialize content
    let content = await getOrInitializeContent(vault, journalPath, config);

    const entry = formatJournalEntry({
      timestamp: now,
      activityType: args.activity_type,
      summary: args.summary,
      keyTopics: args.key_topics,
      outputs: args.outputs,
      project: args.project,
    });

    content = insertUnderSection(content, config.journalActivitySection, entry);

    await vault.writeFile(journalPath, content);

    return {
      success: true,
      data: {
        success: true,
        journal_path: journalPath,
        entry_timestamp: now.toISOString(),
      },
      metadata: {
        timestamp: now.toISOString(),
        affected_files: [journalPath],
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

function insertUnderSection(content: string, sectionHeading: string, entry: string): string {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === sectionHeading) {
      // Find the end of this section (before next heading of same or higher level)
      const sectionLevel = sectionHeading.match(/^#+/)?.[0].length || 2;
      let insertIndex = i + 1;

      // Skip to find the end of this section
      while (insertIndex < lines.length) {
        const line = lines[insertIndex].trim();
        // Check if this is a heading of same or higher level (fewer #'s)
        const headingMatch = line.match(/^(#+)\s/);
        if (headingMatch && headingMatch[1].length <= sectionLevel) {
          break; // Found next section, insert before it
        }
        insertIndex++;
      }

      // Insert before the next section (or at end)
      lines.splice(insertIndex, 0, entry);
      return lines.join('\n');
    }
  }

  return content + '\n\n' + sectionHeading + '\n' + entry;
}

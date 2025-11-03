import { VaultManager } from '@/services/vault-manager';
import type { ToolResponse, JournalConfig } from './types';

type PatchResult = {
  content: string;
  lineRange: { start: number; end: number };
  changedLines: string[];
};

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

    const currentContent = await getOrInitializeContent(vault, args.path, config);

    let patchResult: PatchResult;

    switch (args.anchor_type) {
      case 'heading':
        patchResult = patchAtHeading(
          currentContent,
          args.anchor_value,
          args.content,
          args.position,
        );
        break;
      case 'line':
        patchResult = patchAtLine(
          currentContent,
          parseInt(args.anchor_value),
          args.content,
          args.position,
        );
        break;
      case 'block':
        patchResult = patchAtBlock(currentContent, args.anchor_value, args.content, args.position);
        break;
      case 'frontmatter':
        patchResult = patchFrontmatter(currentContent, args.anchor_value, args.content);
        break;
      default:
        throw new Error(`Unknown anchor type: ${args.anchor_type}`);
    }

    await vault.writeFile(args.path, patchResult.content);

    // Extract context lines for preview
    const allLines = patchResult.content.split('\n');
    const contextSize = 2;
    const startLine = patchResult.lineRange.start;
    const endLine = patchResult.lineRange.end;

    const contextBefore = allLines.slice(Math.max(0, startLine - 1 - contextSize), startLine - 1);
    const contextAfter = allLines.slice(endLine, Math.min(allLines.length, endLine + contextSize));

    return {
      success: true,
      data: {
        success: true,
        path: args.path,
        change_preview: {
          line_range: {
            start: startLine,
            end: endLine,
          },
          context_before: contextBefore,
          changed_content: patchResult.changedLines,
          context_after: contextAfter,
        },
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

function patchAtHeading(
  content: string,
  heading: string,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): PatchResult {
  const lines = content.split('\n');
  const headingRegex = new RegExp(`^#+\\s+${escapeRegExp(heading)}\\s*$`, 'i');

  for (let i = 0; i < lines.length; i++) {
    if (headingRegex.test(lines[i])) {
      let processedContent = newContent;

      // Check if the new content starts with a heading that matches the anchor heading
      // This prevents accidental duplication when users include the heading in their content
      const contentLines = newContent.split('\n');
      if (contentLines.length > 0 && headingRegex.test(contentLines[0].trim())) {
        // Strip the duplicate heading from the beginning
        processedContent = contentLines.slice(1).join('\n');
      }

      const insertedLines = processedContent.split('\n');
      let startLine: number;
      let endLine: number;

      if (position === 'before') {
        lines.splice(i, 0, processedContent);
        startLine = i + 1; // 1-based
        endLine = i + insertedLines.length;
      } else if (position === 'after') {
        lines.splice(i + 1, 0, processedContent);
        startLine = i + 2; // 1-based
        endLine = i + 1 + insertedLines.length;
      } else {
        // replace: remove content under the heading and replace with new content
        let endIndex = i + 1;
        while (endIndex < lines.length && !/^#+\s+/.test(lines[endIndex])) {
          endIndex++;
        }
        lines.splice(i + 1, endIndex - i - 1, processedContent);
        startLine = i + 2; // 1-based, line after heading
        endLine = i + 1 + insertedLines.length;
      }

      return {
        content: lines.join('\n'),
        lineRange: { start: startLine, end: endLine },
        changedLines: insertedLines,
      };
    }
  }

  throw new Error(`Heading "${heading}" not found`);
}

function patchAtLine(
  content: string,
  lineNumber: number,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): PatchResult {
  const lines = content.split('\n');

  if (!Number.isInteger(lineNumber) || isNaN(lineNumber)) {
    throw new Error(`Invalid line number: "${lineNumber}". Line number must be an integer.`);
  }

  if (lineNumber < 1 || lineNumber > lines.length) {
    throw new Error(`Line ${lineNumber} out of range (1-${lines.length})`);
  }

  const index = lineNumber - 1;
  const insertedLines = newContent.split('\n');
  let startLine: number;
  let endLine: number;

  if (position === 'before') {
    lines.splice(index, 0, newContent);
    startLine = lineNumber;
    endLine = lineNumber + insertedLines.length - 1;
  } else if (position === 'after') {
    lines.splice(index + 1, 0, newContent);
    startLine = lineNumber + 1;
    endLine = lineNumber + insertedLines.length;
  } else {
    lines[index] = newContent;
    startLine = lineNumber;
    endLine = lineNumber + insertedLines.length - 1;
  }

  return {
    content: lines.join('\n'),
    lineRange: { start: startLine, end: endLine },
    changedLines: insertedLines,
  };
}

function patchAtBlock(
  content: string,
  blockId: string,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): PatchResult {
  const lines = content.split('\n');
  const blockRegex = new RegExp(`\\^${escapeRegExp(blockId)}\\s*$`);

  for (let i = 0; i < lines.length; i++) {
    if (blockRegex.test(lines[i])) {
      const insertedLines = newContent.split('\n');
      let startLine: number;
      let endLine: number;

      if (position === 'before') {
        lines.splice(i, 0, newContent);
        startLine = i + 1; // 1-based
        endLine = i + insertedLines.length;
      } else if (position === 'after') {
        lines.splice(i + 1, 0, newContent);
        startLine = i + 2; // 1-based
        endLine = i + 1 + insertedLines.length;
      } else {
        lines[i] = newContent;
        startLine = i + 1; // 1-based
        endLine = i + insertedLines.length;
      }

      return {
        content: lines.join('\n'),
        lineRange: { start: startLine, end: endLine },
        changedLines: insertedLines,
      };
    }
  }

  throw new Error(`Block ID ^${blockId} not found`);
}

function patchFrontmatter(content: string, key: string, value: string): PatchResult {
  const lines = content.split('\n');
  const newLine = `${key}: ${value}`;
  let startLine: number;
  let endLine: number;

  if (lines[0] === '---') {
    let endIndex = 1;
    while (endIndex < lines.length && lines[endIndex] !== '---') {
      endIndex++;
    }

    const keyRegex = new RegExp(`^${escapeRegExp(key)}:\\s*`);
    for (let i = 1; i < endIndex; i++) {
      if (keyRegex.test(lines[i])) {
        lines[i] = newLine;
        startLine = i + 1; // 1-based
        endLine = i + 1;
        return {
          content: lines.join('\n'),
          lineRange: { start: startLine, end: endLine },
          changedLines: [newLine],
        };
      }
    }

    // Key doesn't exist, add it before the closing ---
    lines.splice(endIndex, 0, newLine);
    startLine = endIndex + 1; // 1-based
    endLine = endIndex + 1;
  } else {
    // No frontmatter exists, create it
    lines.unshift('---', newLine, '---', '');
    startLine = 2; // 1-based, the key line
    endLine = 2;
  }

  return {
    content: lines.join('\n'),
    lineRange: { start: startLine, end: endLine },
    changedLines: [newLine],
  };
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Helper function to get or initialize content for a file
 * If the file matches the journal path pattern and doesn't exist, initialize from template
 */
export async function getOrInitializeContent(
  vault: VaultManager,
  path: string,
  config?: JournalConfig,
): Promise<string> {
  const exists = await vault.fileExists(path);

  if (exists) {
    return await vault.readFile(path);
  }

  if (!config) {
    return '';
  }

  const templatePattern = config.journalPathTemplate.replace('{{date}}', '(\\d{4}-\\d{2}-\\d{2})');
  const regex = new RegExp('^' + templatePattern + '$');
  const match = path.match(regex);

  if (!match) {
    return '';
  }

  const dateStr = match[1];
  const templateContent = await vault.readFile(config.journalFileTemplate);

  return templateContent.replace(/\{\{date\}\}/g, dateStr);
}

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

export async function handleReadNotes(
  vault: VaultManager,
  args: { paths: string[] },
): Promise<ToolResponse> {
  try {
    const notes = await Promise.all(
      args.paths.map(async path => {
        try {
          const content = await vault.readFile(path);
          return {
            path,
            content,
            success: true,
          };
        } catch (error: any) {
          return {
            path,
            success: false,
            error: error.message,
          };
        }
      }),
    );

    const totalSuccess = notes.filter(n => n.success).length;
    const totalFailed = notes.filter(n => !n.success).length;

    return {
      success: true,
      data: {
        notes,
        total_requested: args.paths.length,
        total_success: totalSuccess,
        total_failed: totalFailed,
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
    anchor_type: 'heading' | 'block' | 'frontmatter' | 'text_match';
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
      case 'text_match':
        patchResult = patchAtTextMatch(
          currentContent,
          args.anchor_value,
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

function patchAtTextMatch(
  content: string,
  pattern: string,
  newContent: string,
  position: 'before' | 'after' | 'replace',
): PatchResult {
  // Validate that pattern is not empty
  if (!pattern || pattern.trim().length === 0) {
    throw new Error('Text pattern cannot be empty');
  }

  const lines = content.split('\n');
  const patternLines = pattern.split('\n');
  const patternLength = patternLines.length;

  // Find all matches of the pattern in the content
  const matches: Array<{ startLine: number; endLine: number }> = [];

  for (let i = 0; i <= lines.length - patternLength; i++) {
    // Check if the pattern matches at this position
    let isMatch = true;
    for (let j = 0; j < patternLength; j++) {
      if (lines[i + j] !== patternLines[j]) {
        isMatch = false;
        break;
      }
    }

    if (isMatch) {
      matches.push({
        startLine: i + 1, // 1-based
        endLine: i + patternLength, // 1-based, inclusive
      });
    }
  }

  // Handle different match scenarios
  if (matches.length === 0) {
    throw new Error(`Text pattern not found in file`);
  }

  if (matches.length > 1) {
    // Build detailed error message with context
    const contextSize = 2;
    let errorMsg = `Text pattern found ${matches.length} times in file:\n`;

    for (const match of matches) {
      const startIdx = match.startLine - 1; // Convert to 0-based
      const endIdx = match.endLine - 1; // Convert to 0-based (inclusive)

      // Get context before
      const beforeStart = Math.max(0, startIdx - contextSize);
      const contextBefore = lines.slice(beforeStart, startIdx);

      // Get context after
      const afterEnd = Math.min(lines.length, endIdx + 1 + contextSize);
      const contextAfter = lines.slice(endIdx + 1, afterEnd);

      // Build context display
      errorMsg += `  Lines ${match.startLine}-${match.endLine}:\n`;
      if (contextBefore.length > 0) {
        errorMsg += `    ${contextBefore.join('\n    ')}\n`;
      }
      errorMsg += `    > ${lines.slice(startIdx, endIdx + 1).join('\n    > ')}\n`;
      if (contextAfter.length > 0) {
        errorMsg += `    ${contextAfter.join('\n    ')}\n`;
      }
    }

    errorMsg += 'Please provide more context in anchor_value to uniquely identify the location.';
    throw new Error(errorMsg);
  }

  // Exactly one match - perform the operation
  const match = matches[0];
  const matchStartIdx = match.startLine - 1; // Convert to 0-based
  const matchEndIdx = match.endLine - 1; // Convert to 0-based (inclusive)

  const insertedLines = newContent.split('\n');
  let startLine: number;
  let endLine: number;

  if (position === 'before') {
    lines.splice(matchStartIdx, 0, newContent);
    startLine = match.startLine; // 1-based
    endLine = match.startLine + insertedLines.length - 1;
  } else if (position === 'after') {
    lines.splice(matchEndIdx + 1, 0, newContent);
    startLine = match.endLine + 1; // 1-based
    endLine = match.endLine + insertedLines.length;
  } else {
    // replace: remove matched lines and insert new content
    lines.splice(matchStartIdx, patternLength, newContent);
    startLine = match.startLine; // 1-based
    endLine = match.startLine + insertedLines.length - 1;
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

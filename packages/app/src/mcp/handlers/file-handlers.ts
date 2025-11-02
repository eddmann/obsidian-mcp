import { VaultManager } from '@/services/vault-manager';
import type { ToolResponse, JournalConfig } from './types';

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

  if (!Number.isInteger(lineNumber) || isNaN(lineNumber)) {
    throw new Error(`Invalid line number: "${lineNumber}". Line number must be an integer.`);
  }

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

import { VaultManager } from '@/services/vault-manager';
import type { ToolResponse } from './types';

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

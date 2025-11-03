import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { VaultManager } from './vault-manager';
import { logger } from '@/utils/logger';
import { getAuthenticatedGitUrl } from './git-auth-provider';

export interface VaultConfig {
  repoUrl: string;
  branch: string;
  gitToken: string;
  gitUsername?: string;
  vaultPath: string;
}

export class GitVaultManager implements VaultManager {
  private config: VaultConfig;

  constructor(config: VaultConfig) {
    this.config = config;
  }

  private createGitInstance(baseDir?: string): SimpleGit {
    const instance = baseDir ? simpleGit(baseDir) : simpleGit();
    return instance.env({
      GIT_TERMINAL_PROMPT: '0',
    });
  }

  /**
   * Create authenticated URL by embedding credentials
   * Uses automatic provider detection to determine the correct authentication format
   */
  private getAuthenticatedUrl(): string {
    return getAuthenticatedGitUrl(
      this.config.repoUrl,
      this.config.gitToken,
      this.config.gitUsername,
    );
  }

  /**
   * Sanitize URL for logging (remove credentials)
   */
  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      parsed.username = parsed.username ? '***' : '';
      parsed.password = '';
      return parsed.toString();
    } catch {
      return 'invalid-url';
    }
  }

  /**
   * Initialize the vault (clone or sync on every invocation)
   * - Cold start: Clone the repo if it doesn't exist
   * - Warm start: Sync with remote on every request
   */
  private async initialize(): Promise<void> {
    const vaultExists = existsSync(this.config.vaultPath);

    if (!vaultExists) {
      logger.info('Cloning vault', {
        repoUrl: this.sanitizeUrl(this.config.repoUrl),
        branch: this.config.branch,
      });
      await this.cloneVault();
    } else {
      logger.debug('Vault exists, syncing with remote');
      await this.syncVault();
    }
  }

  /**
   * Remove the vault directory completely
   */
  private async removeVault(): Promise<void> {
    if (existsSync(this.config.vaultPath)) {
      logger.debug('Removing vault directory for fresh clone');
      await fs.rm(this.config.vaultPath, { recursive: true, force: true });
    }
  }

  /**
   * Clone the vault repository (cold start)
   */
  private async cloneVault(): Promise<void> {
    const tempGit = this.createGitInstance();
    const authUrl = this.getAuthenticatedUrl();

    await tempGit.clone(authUrl, this.config.vaultPath, {
      '--depth': 1,
      '--branch': this.config.branch,
      '--single-branch': null,
    });

    const vaultGit = this.createGitInstance(this.config.vaultPath);
    await vaultGit.addConfig('user.name', 'Obsidian MCP Server');
    await vaultGit.addConfig('user.email', 'mcp@obsidian.local');
  }

  /**
   * Sync vault with remote (warm start)
   */
  private async syncVault(): Promise<void> {
    const startTime = Date.now();
    const vaultGit = this.createGitInstance(this.config.vaultPath);
    const authUrl = this.getAuthenticatedUrl();

    try {
      // Set the remote URL with embedded credentials for authenticated operations
      await vaultGit.remote(['set-url', 'origin', authUrl]);

      // Fetch latest remote state with timeout
      logger.debug('Fetching latest changes from remote');
      await Promise.race([
        vaultGit.fetch('origin', this.config.branch),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Fetch timeout')), 5000),
        ),
      ]);

      // Reset to clean "as cloned" state - matches remote exactly
      logger.debug('Resetting vault to clean state');
      await vaultGit.reset(['--hard', `origin/${this.config.branch}`]);

      // Remove untracked files and directories (-f = force, -d = directories, -x = ignored files)
      await vaultGit.clean('fdx');

      logger.info('Vault synced with remote', {
        durationMs: Date.now() - startTime,
        branch: this.config.branch,
      });
    } catch (error) {
      logger.error('Sync failed, removing vault and performing fresh clone', {
        error,
        durationMs: Date.now() - startTime,
        branch: this.config.branch,
      });
      await this.removeVault();
      await this.cloneVault();
    }
  }

  /**
   * Commit and push changes (synchronous, blocking)
   * Private method - called automatically after write operations
   */
  private async commitAndPush(message: string, affectedFiles: string[]): Promise<void> {
    const vaultGit = this.createGitInstance(this.config.vaultPath);

    if (affectedFiles.length > 0) {
      await vaultGit.raw(['add', '-A', ...affectedFiles]);
    } else {
      await vaultGit.raw(['add', '-A']);
    }

    const status = await vaultGit.status();
    if (status.files.length === 0) {
      logger.debug('No changes to commit');
      return;
    }

    await vaultGit.commit(message);
    await this.pushWithRetry(vaultGit, 3);
  }

  /**
   * Push with exponential backoff retry
   */
  private async pushWithRetry(vaultGit: SimpleGit, maxAttempts: number): Promise<void> {
    const startTime = Date.now();
    const authUrl = this.getAuthenticatedUrl();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Ensure remote URL has credentials before pushing
        await vaultGit.remote(['set-url', 'origin', authUrl]);
        await vaultGit.push('origin', this.config.branch);
        logger.info('Successfully pushed changes', {
          durationMs: Date.now() - startTime,
          attempts: attempt,
          branch: this.config.branch,
        });
        return;
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error(`Failed to push after ${maxAttempts} attempts: ${error}`);
        }

        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('Push attempt failed, retrying', {
          attempt,
          maxAttempts,
          delayMs: delay,
          error,
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Read a file from the vault
   */
  async readFile(relativePath: string): Promise<string> {
    await this.initialize();
    const fullPath = path.join(this.config.vaultPath, relativePath);

    try {
      return await fs.readFile(fullPath, 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to read file ${relativePath}: ${error.message}`);
    }
  }

  /**
   * Write content to a file
   * Automatically commits and pushes the change
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    await this.initialize();
    const fullPath = path.join(this.config.vaultPath, relativePath);

    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(fullPath, content, 'utf-8');
    await this.commitAndPush(`Update file: ${relativePath}`, [relativePath]);

    logger.debug('File written successfully', {
      path: relativePath,
      sizeBytes: content.length,
    });
  }

  /**
   * Delete a file
   * Automatically commits and pushes the change
   */
  async deleteFile(relativePath: string): Promise<void> {
    await this.initialize();
    const fullPath = path.join(this.config.vaultPath, relativePath);

    try {
      const stats = await this.getFileStats(relativePath);
      if (stats.isDirectory) {
        throw new Error(`Cannot delete ${relativePath}: it is a directory`);
      }

      await fs.unlink(fullPath);
      await this.commitAndPush(`Delete file: ${relativePath}`, [relativePath]);

      logger.debug('File deleted successfully', {
        path: relativePath,
      });
    } catch (error: any) {
      throw new Error(`Failed to delete file ${relativePath}: ${error.message}`);
    }
  }

  /**
   * Move/rename a file
   * Automatically commits and pushes the change
   */
  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    await this.initialize();
    const fullSourcePath = path.join(this.config.vaultPath, sourcePath);
    const fullDestPath = path.join(this.config.vaultPath, destPath);

    const destDir = path.dirname(fullDestPath);
    await fs.mkdir(destDir, { recursive: true });

    await fs.rename(fullSourcePath, fullDestPath);
    await this.commitAndPush(`Move file: ${sourcePath} → ${destPath}`, [sourcePath, destPath]);
  }

  /**
   * Create a directory
   */
  async createDirectory(relativePath: string, recursive: boolean): Promise<void> {
    await this.initialize();
    const fullPath = path.join(this.config.vaultPath, relativePath);
    await fs.mkdir(fullPath, { recursive });
  }

  /**
   * List files in a directory
   */
  async listFiles(
    relativePath: string = '',
    options: {
      includeDirectories?: boolean;
      fileTypes?: string[];
      recursive?: boolean;
    } = {},
  ): Promise<string[]> {
    await this.initialize();
    const fullPath = path.join(this.config.vaultPath, relativePath);

    const files: string[] = [];
    await this.walkDirectory(fullPath, this.config.vaultPath, files, options);

    return files;
  }

  /**
   * Recursively walk directory
   */
  private async walkDirectory(
    dir: string,
    basePath: string,
    files: string[],
    options: {
      includeDirectories?: boolean;
      fileTypes?: string[];
      recursive?: boolean;
    },
  ): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.obsidian') {
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      if (entry.isDirectory()) {
        if (options.includeDirectories) {
          files.push(relativePath);
        }

        if (options.recursive !== false) {
          await this.walkDirectory(fullPath, basePath, files, options);
        }
      } else {
        if (options.fileTypes && options.fileTypes.length > 0) {
          const ext = path.extname(entry.name).substring(1);
          if (!options.fileTypes.includes(ext)) {
            continue;
          }
        }

        files.push(relativePath);
      }
    }
  }

  /**
   * Check if a file exists
   */
  async fileExists(relativePath: string): Promise<boolean> {
    await this.initialize();
    const fullPath = path.join(this.config.vaultPath, relativePath);
    return existsSync(fullPath);
  }

  /**
   * Get file stats (private helper method)
   */
  private async getFileStats(relativePath: string): Promise<{
    size: number;
    modified: Date;
    isDirectory: boolean;
  }> {
    await this.initialize();
    const fullPath = path.join(this.config.vaultPath, relativePath);

    try {
      const stats = await fs.stat(fullPath);
      return {
        size: stats.size,
        modified: stats.mtime,
        isDirectory: stats.isDirectory(),
      };
    } catch (error: any) {
      throw new Error(`Failed to get stats for ${relativePath}: ${error.message}`);
    }
  }

  /**
   * Get the absolute path to the vault
   */
  getVaultPath(): string {
    return this.config.vaultPath;
  }
}

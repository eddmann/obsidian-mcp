import { AsyncLocalStorage } from 'node:async_hooks';
import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import { VaultManager } from './vault-manager';
import { logger, redactSensitiveText } from '@/utils/logger';
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
  private operationQueue: Promise<void> = Promise.resolve();
  private operationContext = new AsyncLocalStorage<{ active: boolean }>();

  /** Hold the checkout for a whole tool operation, including read-modify-write. */
  async runOperation<T>(operation: () => Promise<T>): Promise<T> {
    if (this.operationContext.getStore()?.active) return operation();

    const previous = this.operationQueue;
    let release!: () => void;
    this.operationQueue = new Promise<void>(resolve => {
      release = resolve;
    });
    await previous;
    const context = { active: true };
    try {
      return await this.operationContext.run(context, async () => {
        await this.initialize();
        return await operation();
      });
    } catch (error) {
      logger.error('Vault operation failed', { error });
      // Git errors may include an authenticated command URL. Never return it to clients.
      throw new Error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    } finally {
      context.active = false;
      release();
    }
  }

  constructor(config: VaultConfig) {
    this.config = config;
  }

  private createGitInstance(baseDir?: string): SimpleGit {
    const instance = simpleGit({ baseDir, timeout: { block: 30000 } });
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
   * Initialize the vault once per serialized operation
   * - Cold start: Clone the repo if it doesn't exist
   * - Warm start: Sync once before the operation reads or writes files
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
   * Clone the vault repository (cold start)
   */
  private async cloneVault(): Promise<void> {
    const tempGit = this.createGitInstance();
    const authUrl = this.getAuthenticatedUrl();

    await fs.mkdir(path.dirname(this.config.vaultPath), { recursive: true });
    const stagingPath = await fs.mkdtemp(`${this.config.vaultPath}-clone-`);
    try {
      await tempGit.clone(authUrl, stagingPath, {
        '--depth': 1,
        '--branch': this.config.branch,
        '--single-branch': null,
      });
      const vaultGit = this.createGitInstance(stagingPath);
      await vaultGit.addConfig('user.name', 'Obsidian MCP Server');
      await vaultGit.addConfig('user.email', 'mcp@obsidian.local');
      await fs.rename(stagingPath, this.config.vaultPath);
    } finally {
      await fs.rm(stagingPath, { recursive: true, force: true });
    }
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

      // A real process timeout stops Git before the checkout can be reused.
      await vaultGit.fetch('origin', this.config.branch);
      // Preserve unpushed commits and local files after a failed write. Divergence
      // fails closed instead of deleting the checkout and losing local changes.
      await vaultGit.merge(['--ff-only', `origin/${this.config.branch}`]);

      logger.info('Vault synced with remote', {
        durationMs: Date.now() - startTime,
        branch: this.config.branch,
      });
    } catch (error) {
      logger.error('Vault sync failed; preserving checkout', {
        error,
        durationMs: Date.now() - startTime,
        branch: this.config.branch,
      });
      throw error;
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

    const stagedFiles = await vaultGit.diff(['--cached', '--name-only']);
    if (stagedFiles.trim()) {
      await vaultGit.commit(message);
    }
    // A retry may have no new diff but still have a commit whose push failed.
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
    return this.runOperation(async () => {
      const fullPath = path.join(this.config.vaultPath, relativePath);

      try {
        return await fs.readFile(fullPath, 'utf-8');
      } catch (error: any) {
        throw new Error(`Failed to read file ${relativePath}: ${error.message}`);
      }
    });
  }

  /**
   * Write content to a file
   * Automatically commits and pushes the change
   */
  async writeFile(relativePath: string, content: string): Promise<void> {
    return this.runOperation(async () => {
      const fullPath = path.join(this.config.vaultPath, relativePath);

      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(fullPath, content, 'utf-8');
      await this.commitAndPush(`Update file: ${relativePath}`, [relativePath]);

      logger.debug('File written successfully', {
        path: relativePath,
        sizeBytes: content.length,
      });
    });
  }

  /**
   * Delete a file
   * Automatically commits and pushes the change
   */
  async deleteFile(relativePath: string): Promise<void> {
    return this.runOperation(async () => {
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
    });
  }

  /**
   * Move/rename a file
   * Automatically commits and pushes the change
   */
  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    return this.runOperation(async () => {
      const fullSourcePath = path.join(this.config.vaultPath, sourcePath);
      const fullDestPath = path.join(this.config.vaultPath, destPath);

      const destDir = path.dirname(fullDestPath);
      await fs.mkdir(destDir, { recursive: true });

      await fs.rename(fullSourcePath, fullDestPath);
      await this.commitAndPush(`Move file: ${sourcePath} → ${destPath}`, [sourcePath, destPath]);
    });
  }

  /**
   * Create a directory
   */
  async createDirectory(relativePath: string, recursive: boolean): Promise<void> {
    return this.runOperation(async () => {
      const fullPath = path.join(this.config.vaultPath, relativePath);
      await fs.mkdir(fullPath, { recursive });
    });
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
    return this.runOperation(async () => {
      const fullPath = path.join(this.config.vaultPath, relativePath);

      const files: string[] = [];
      await this.walkDirectory(fullPath, this.config.vaultPath, files, options);

      return files;
    });
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
    return this.runOperation(async () => {
      const fullPath = path.join(this.config.vaultPath, relativePath);
      return existsSync(fullPath);
    });
  }

  /**
   * Get file stats (private helper method)
   */
  private async getFileStats(relativePath: string): Promise<{
    size: number;
    modified: Date;
    isDirectory: boolean;
  }> {
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

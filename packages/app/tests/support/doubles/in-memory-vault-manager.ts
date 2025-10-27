import { VaultManager } from '@/services/vault-manager';

interface FileRecord {
  content: string;
  modified: number;
  isDirectory: boolean;
}

export class InMemoryVaultManager implements VaultManager {
  private files = new Map<string, FileRecord>();
  private directories = new Set<string>(['']);

  constructor(initialFiles: Record<string, string> = {}) {
    Object.entries(initialFiles).forEach(([path, content]) => {
      this.files.set(path, {
        content,
        modified: Date.now(),
        isDirectory: false,
      });
      this.ensureDirectoryForFile(path);
    });
  }

  async readFile(relativePath: string): Promise<string> {
    const record = this.files.get(relativePath);
    if (!record || record.isDirectory) {
      throw new Error(`Failed to read file ${relativePath}: not found`);
    }
    return record.content;
  }

  async writeFile(relativePath: string, content: string): Promise<void> {
    this.ensureDirectoryForFile(relativePath);
    this.files.set(relativePath, {
      content,
      modified: Date.now(),
      isDirectory: false,
    });
  }

  async deleteFile(relativePath: string): Promise<void> {
    if (this.directories.has(relativePath)) {
      throw new Error(
        `Failed to delete file ${relativePath}: Cannot delete ${relativePath}: it is a directory`,
      );
    }
    if (!this.files.has(relativePath)) {
      throw new Error(`Failed to delete file ${relativePath}: not found`);
    }
    this.files.delete(relativePath);
  }

  async moveFile(sourcePath: string, destPath: string): Promise<void> {
    const record = this.files.get(sourcePath);
    if (!record) {
      throw new Error(`Failed to move file ${sourcePath}: not found`);
    }
    this.files.delete(sourcePath);
    this.ensureDirectoryForFile(destPath);
    this.files.set(destPath, { ...record, modified: Date.now() });
  }

  async createDirectory(relativePath: string, recursive: boolean): Promise<void> {
    if (recursive) {
      const parts = relativePath.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        this.directories.add(current);
      }
    }
    this.directories.add(relativePath);
  }

  async listFiles(
    relativePath: string = '',
    options: {
      includeDirectories?: boolean;
      fileTypes?: string[];
      recursive?: boolean;
    } = {},
  ): Promise<string[]> {
    const prefix = relativePath ? `${relativePath.replace(/\/$/, '')}/` : '';
    const results: string[] = [];

    if (options.includeDirectories) {
      for (const dir of this.directories) {
        if (!dir.startsWith(prefix) && prefix !== '') continue;
        if (dir === relativePath) continue;
        if (options.recursive === false && dir.replace(prefix, '').includes('/')) continue;
        if (dir.length === 0) continue;
        results.push(dir);
      }
    }

    for (const [path, record] of this.files.entries()) {
      if (record.isDirectory) continue;
      if (prefix && !path.startsWith(prefix)) continue;
      if (options.recursive === false) {
        const remainder = prefix ? path.slice(prefix.length) : path;
        if (remainder.includes('/')) continue;
      }
      if (options.fileTypes?.length) {
        const ext = path.split('.').pop() ?? '';
        if (!options.fileTypes.includes(ext)) continue;
      }
      results.push(path);
    }

    return results.sort();
  }

  async fileExists(relativePath: string): Promise<boolean> {
    return this.files.has(relativePath);
  }

  getVaultPath(): string {
    return '/fake/vault';
  }

  private ensureDirectoryForFile(filePath: string): void {
    const parts = filePath.split('/').slice(0, -1);
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      this.directories.add(current);
    }
  }
}

export interface VaultManager {
  readFile(relativePath: string): Promise<string>;
  writeFile(relativePath: string, content: string): Promise<void>;
  deleteFile(relativePath: string): Promise<void>;
  moveFile(sourcePath: string, destPath: string): Promise<void>;
  createDirectory(relativePath: string, recursive: boolean): Promise<void>;
  listFiles(
    relativePath?: string,
    options?: {
      includeDirectories?: boolean;
      fileTypes?: string[];
      recursive?: boolean;
    },
  ): Promise<string[]>;
  fileExists(relativePath: string): Promise<boolean>;
  getVaultPath(): string;
}

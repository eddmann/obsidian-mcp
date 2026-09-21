/** Use one stable checkout across a complete tool/resource operation. */
export function runVaultOperation<T>(vault: VaultManager, operation: () => Promise<T>): Promise<T> {
  return vault.runOperation ? vault.runOperation(operation) : operation();
}

export interface VaultManager {
  runOperation?<T>(operation: () => Promise<T>): Promise<T>;
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

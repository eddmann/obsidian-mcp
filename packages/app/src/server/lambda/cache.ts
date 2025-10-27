import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import { existsSync } from 'fs';

export interface FileIndexEntry {
  path: string;
  size: number;
  modified: number; // timestamp
  hash: string;
}

export interface FileIndex {
  timestamp: number;
  files: Map<string, FileIndexEntry>;
}

const INDEX_CACHE_PATH = '/tmp/obsidian-index.json';
const INDEX_TTL_MS = 5 * 60 * 1000;
const CACHE_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function loadFileIndex(): Promise<FileIndex | null> {
  if (!existsSync(INDEX_CACHE_PATH)) {
    return null;
  }

  try {
    const data = await fs.readFile(INDEX_CACHE_PATH, 'utf-8');
    const parsed = JSON.parse(data);

    const age = Date.now() - parsed.timestamp;
    if (age > INDEX_TTL_MS) {
      return null;
    }

    const files = new Map<string, FileIndexEntry>(
      parsed.files.map((entry: FileIndexEntry) => [entry.path, entry]),
    );

    return {
      timestamp: parsed.timestamp,
      files,
    };
  } catch (error) {
    console.warn('Failed to load file index cache:', error);
    return null;
  }
}

export async function saveFileIndex(index: FileIndex): Promise<void> {
  try {
    const filesArray = Array.from(index.files.values());

    const data = JSON.stringify({
      timestamp: index.timestamp,
      files: filesArray,
    });

    await fs.writeFile(INDEX_CACHE_PATH, data, 'utf-8');
  } catch (error) {
    console.warn('Failed to save file index cache:', error);
  }
}

export async function buildFileIndex(vaultPath: string): Promise<FileIndex> {
  const files = new Map<string, FileIndexEntry>();

  async function walk(dir: string, basePath: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === '.obsidian') {
        continue;
      }

      const fullPath = `${dir}/${entry.name}`;

      if (entry.isDirectory()) {
        await walk(fullPath, basePath);
      } else {
        const relativePath = fullPath.replace(basePath + '/', '');
        const stats = await fs.stat(fullPath);
        const content = await fs.readFile(fullPath);
        const hash = crypto.createHash('md5').update(content).digest('hex');

        files.set(relativePath, {
          path: relativePath,
          size: stats.size,
          modified: stats.mtimeMs,
          hash,
        });
      }
    }
  }

  await walk(vaultPath, vaultPath);

  return {
    timestamp: Date.now(),
    files,
  };
}

export async function cleanupOldCache(): Promise<void> {
  const tmpFiles = await fs.readdir('/tmp');

  for (const file of tmpFiles) {
    if (file.startsWith('obsidian-')) {
      const fullPath = `/tmp/${file}`;

      try {
        const stats = await fs.stat(fullPath);
        const age = Date.now() - stats.mtimeMs;

        if (age > CACHE_RETENTION_MS) {
          if (stats.isDirectory()) {
            await fs.rm(fullPath, { recursive: true, force: true });
          } else {
            await fs.unlink(fullPath);
          }
        }
      } catch (error) {
        console.warn(`Failed to clean up ${file}:`, error);
      }
    }
  }
}

export function detectStartType(): 'cold' | 'warm' {
  return existsSync('/tmp/obsidian-vault') ? 'warm' : 'cold';
}

let invocationCount = 0;
export function getInvocationCount(): number {
  return ++invocationCount;
}

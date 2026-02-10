import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRemote = vi.fn().mockResolvedValue(undefined);
const mockFetch = vi.fn().mockResolvedValue(undefined);
const mockReset = vi.fn().mockResolvedValue(undefined);
const mockClean = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue('# ok');

vi.mock('simple-git', () => {
  return {
    simpleGit: vi.fn(() => ({
      env: vi.fn().mockReturnThis(),
      remote: mockRemote,
      fetch: mockFetch,
      reset: mockReset,
      clean: mockClean,
      clone: vi.fn().mockResolvedValue(undefined),
      addConfig: vi.fn().mockResolvedValue(undefined),
      raw: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ files: [] }),
      commit: vi.fn().mockResolvedValue(undefined),
      push: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

vi.mock('fs/promises', () => {
  return {
    default: {},
    readFile: mockReadFile,
    rm: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('fs', () => {
  return {
    existsSync: vi.fn(() => true),
  };
});

vi.mock('@/utils/logger', () => {
  return {
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

describe('GitVaultManager concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs sync only once for concurrent readFile calls', async () => {
    const { GitVaultManager } = await import('@/services/git-vault-manager');

    const manager = new GitVaultManager({
      repoUrl: 'https://github.com/example/vault.git',
      branch: 'main',
      gitToken: 'token',
      vaultPath: './vault-local',
    });

    await Promise.all([
      manager.readFile('a.md'),
      manager.readFile('b.md'),
      manager.readFile('c.md'),
      manager.readFile('d.md'),
      manager.readFile('e.md'),
    ]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockReset).toHaveBeenCalledTimes(1);
    expect(mockClean).toHaveBeenCalledTimes(1);
    expect(mockReadFile).toHaveBeenCalledTimes(5);
  });
});

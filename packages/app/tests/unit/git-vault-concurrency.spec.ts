import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { GitVaultManager } from '@/services/git-vault-manager';
import { runVaultOperation } from '@/services/vault-manager';
import { handleSearchVault } from '@/mcp/handlers/search-handlers';
import { configureLogger } from '@/utils/logger';

// Only authentication is replaced: clone/fetch/merge/commit/push use real Git.
vi.mock('@/services/git-auth-provider', () => ({ getAuthenticatedGitUrl: (url: string) => url }));

let root: string;
let remote: string;
let checkout: string;
let vault: GitVaultManager;
let logs: Array<{ message: string }>;

beforeEach(async () => {
  logs = [];
  configureLogger({
    stream: {
      write: (line: string) => logs.push(JSON.parse(line)),
    } as unknown as NodeJS.WriteStream,
  });
  root = await mkdtemp(path.join(tmpdir(), 'vault-regression-'));
  remote = path.join(root, 'remote.git');
  checkout = path.join(root, 'checkout');
  const seed = path.join(root, 'seed');
  await mkdir(seed);
  const git = simpleGit(seed);
  await git.init(false, { '--initial-branch': 'main' });
  await git.addConfig('user.name', 'Test');
  await git.addConfig('user.email', 'test@example.com');
  for (let i = 0; i < 30; i++) await writeFile(path.join(seed, `${i}.md`), `needle ${i}\n`);
  await git.add('.');
  await git.commit('Seed');
  await simpleGit().clone(seed, remote, ['--bare']);
  vault = new GitVaultManager({
    repoUrl: remote,
    branch: 'main',
    gitToken: 'unused',
    vaultPath: checkout,
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

describe('Git operation isolation', () => {
  it('searches all files with one sync per operation, including concurrent cold starts', async () => {
    const search = () =>
      runVaultOperation(vault, () => handleSearchVault(vault, { query: 'needle', limit: 50 }));
    const results = await Promise.all([search(), search()]);
    for (const result of results) {
      expect(result.success).toBe(true);
      expect((result.data as { results: unknown[] }).results).toHaveLength(30);
    }
    expect(logs.filter(x => x.message === 'Cloning vault')).toHaveLength(1);
    expect(logs.filter(x => x.message === 'Vault synced with remote')).toHaveLength(1);
    expect(logs.some(x => /failed|Error/.test(x.message))).toBe(false);
  });

  it('preserves both overlapping read-modify-write operations in the remote', async () => {
    const append = (value: string) =>
      runVaultOperation(vault, async () => {
        const before = await vault.readFile('0.md');
        await vault.writeFile('0.md', before + value);
      });
    await Promise.all([append('first\n'), append('second\n')]);
    expect(await simpleGit(remote).show(['main:0.md'])).toBe('needle 0\nfirst\nsecond\n');
  });

  it('keeps local files on fetch failure and releases the operation queue for recovery', async () => {
    await vault.readFile('0.md');
    await writeFile(path.join(checkout, 'unsaved.md'), 'keep me');
    await rename(remote, remote + '-offline');
    await expect(vault.readFile('0.md')).rejects.toThrow();
    expect(await readFile(path.join(checkout, 'unsaved.md'), 'utf8')).toBe('keep me');
    await rename(remote + '-offline', remote);
    expect(await vault.readFile('0.md')).toBe('needle 0\n');
    expect(logs.filter(x => x.message === 'Cloning vault')).toHaveLength(1);
  });

  it('preserves unpushed commits after a failed push and includes them in the next successful push', async () => {
    // Fail after the real local commit, at the network boundary.
    vi.spyOn(
      vault as unknown as { pushWithRetry: () => Promise<void> },
      'pushWithRetry',
    ).mockRejectedValueOnce(new Error('network unavailable'));
    await expect(vault.writeFile('pending.md', 'saved locally')).rejects.toThrow(
      'network unavailable',
    );
    expect(await vault.readFile('pending.md')).toBe('saved locally');
    await vault.writeFile('next.md', 'next write');
    expect(await simpleGit(remote).show(['main:pending.md'])).toBe('saved locally');
    expect(await simpleGit(remote).show(['main:next.md'])).toBe('next write');
  });
  it('retries an identical write whose commit succeeded but push failed', async () => {
    vi.spyOn(
      vault as unknown as { pushWithRetry: () => Promise<void> },
      'pushWithRetry',
    ).mockRejectedValueOnce(new Error('network unavailable'));
    await expect(vault.writeFile('pending.md', 'retry me')).rejects.toThrow();
    await vault.writeFile('pending.md', 'retry me');
    expect(await simpleGit(remote).show(['main:pending.md'])).toBe('retry me');
  });

  it('retries a failed cold clone without leaving a partially initialized checkout', async () => {
    await rename(remote, remote + '-offline');
    await expect(vault.readFile('0.md')).rejects.toThrow();
    await rename(remote + '-offline', remote);
    expect(await vault.readFile('0.md')).toBe('needle 0\n');
  });

  it('fast-forwards external changes and preserves local commits on divergence', async () => {
    await vault.readFile('0.md');
    const seed = simpleGit(path.join(root, 'seed'));
    await seed.addRemote('origin', remote);
    await writeFile(path.join(root, 'seed', 'external.md'), 'external');
    await seed.add('.');
    await seed.commit('External change');
    await seed.push('origin', 'main');
    expect(await vault.readFile('external.md')).toBe('external');
    vi.spyOn(
      vault as unknown as { pushWithRetry: () => Promise<void> },
      'pushWithRetry',
    ).mockRejectedValueOnce(new Error('network unavailable'));
    await expect(vault.writeFile('pending.md', 'preserve')).rejects.toThrow();
    await writeFile(path.join(root, 'seed', 'external.md'), 'new external');
    await seed.add('.');
    await seed.commit('Diverging change');
    await seed.push('origin', 'main');
    await expect(vault.readFile('0.md')).rejects.toThrow();
    expect(await readFile(path.join(checkout, 'pending.md'), 'utf8')).toBe('preserve');
    expect(await simpleGit(remote).show(['main:external.md'])).toBe('new external');
  });
});

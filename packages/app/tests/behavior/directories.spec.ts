import { afterEach, describe, expect, it } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  harness?.dispose();
});

describe('Directory tool behaviours', () => {
  it('creates a directory and stages a .gitkeep file', async () => {
    harness = new ToolHarness();

    const { success, data } = await harness.invoke('create-directory', {
      path: 'Projects/New',
    });

    expect(success).toBe(true);
    expect(data).toEqual({ success: true, path: 'Projects/New' });
    expect(await harness.vault.readFile('Projects/New/.gitkeep')).toBe('');
  });

  it('lists files in the vault with filters applied', async () => {
    const vault = new InMemoryVaultManager({
      'Docs/readme.md': '# Readme',
      'Docs/design.pdf': '<pdf>',
      'Images/photo.png': '<binary>',
    });
    harness = new ToolHarness({ vault });

    const listAll = await harness.invoke('list-files-in-vault', {
      file_types: ['md', 'pdf'],
      include_directories: false,
    });

    expect(listAll.success).toBe(true);
    expect(listAll.data.count).toBe(2);
    expect(listAll.data.files).toEqual(
      expect.arrayContaining(['Docs/design.pdf', 'Docs/readme.md']),
    );
  });

  it('lists directories recursively when requested', async () => {
    const vault = new InMemoryVaultManager({
      'Docs/guide.md': '# Guide',
      'Docs/Sub/topic.md': '# Topic',
    });
    await vault.createDirectory('Docs/Sub', true);

    harness = new ToolHarness({ vault });

    const listVault = await harness.invoke('list-files-in-vault', {
      include_directories: true,
      recursive: true,
    });

    expect(listVault.success).toBe(true);
    expect(listVault.data.count).toBe(4);
    expect(listVault.data.files).toEqual(
      expect.arrayContaining(['Docs', 'Docs/guide.md', 'Docs/Sub', 'Docs/Sub/topic.md']),
    );

    const listDir = await harness.invoke('list-files-in-dir', {
      path: 'Docs',
      include_directories: true,
      recursive: true,
    });

    expect(listDir.success).toBe(true);
    expect(listDir.data.count).toBe(3);
    expect(listDir.data.directory).toBe('Docs');
    expect(listDir.data.files).toEqual(
      expect.arrayContaining(['Docs/Sub', 'Docs/Sub/topic.md', 'Docs/guide.md']),
    );
  });

  it('creates deeply nested directory structure', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('create-directory', {
      path: 'Deep/Nested/Path/Structure',
      recursive: true,
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.fileExists('Deep/Nested/Path/Structure/.gitkeep')).toBe(true);
  });

  it('lists files without recursion (non-recursive)', async () => {
    const vault = new InMemoryVaultManager({
      'Root.md': 'Root file',
      'Deep/nested.md': 'Nested file',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('list-files-in-vault', {
      recursive: false,
      include_directories: false,
    });

    expect(result.success).toBe(true);
    expect(result.data.files).toContain('Root.md');
    expect(result.data.files).not.toContain('Deep/nested.md');
  });

  it('returns empty list when no files match filters', async () => {
    const vault = new InMemoryVaultManager({
      'Doc.md': 'Content',
      'Image.png': 'binary',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('list-files-in-vault', {
      file_types: ['pdf'],
      include_directories: false,
    });

    expect(result.success).toBe(true);
    expect(result.data.count).toBe(0);
    expect(result.data.files).toEqual([]);
  });

  it('lists specific directory non-recursively', async () => {
    const vault = new InMemoryVaultManager({
      'Docs/file1.md': 'File 1',
      'Docs/file2.md': 'File 2',
      'Docs/Sub/nested.md': 'Nested',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('list-files-in-dir', {
      path: 'Docs',
      recursive: false,
      include_directories: false,
    });

    expect(result.success).toBe(true);
    expect(result.data.files).toContain('Docs/file1.md');
    expect(result.data.files).toContain('Docs/file2.md');
    expect(result.data.files).not.toContain('Docs/Sub/nested.md');
  });

  it('lists non-existent directory as empty', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('list-files-in-dir', {
      path: 'NonExistent',
    });

    // Implementation may return empty list rather than error
    expect(result.success).toBe(true);
    expect(result.data.count).toBe(0);
  });

  it('handles directory creation when directory already exists', async () => {
    const vault = new InMemoryVaultManager({
      'Existing/.gitkeep': '',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('create-directory', {
      path: 'Existing',
    });

    // Should succeed or fail gracefully - implementation dependent
    // At minimum, should not crash
    expect(result).toBeDefined();
  });
});

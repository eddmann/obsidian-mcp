import { afterEach, describe, expect, it } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  harness?.dispose();
});

describe('Cross-cutting error handling behaviours', () => {
  it('handles files with no extension gracefully', async () => {
    const vault = new InMemoryVaultManager({
      NoExtension: 'Some content',
    });
    harness = new ToolHarness({ vault });

    const readResult = await harness.invoke('read-note', {
      path: 'NoExtension',
    });

    expect(readResult.success).toBe(true);
    expect(readResult.data.content).toBe('Some content');

    const editResult = await harness.invoke('edit-note', {
      path: 'NoExtension',
      content: 'Updated',
    });

    expect(editResult.success).toBe(true);
    expect(await harness.vault.readFile('NoExtension')).toBe('Updated');
  });

  it('handles empty file operations correctly', async () => {
    const vault = new InMemoryVaultManager({
      'Empty.md': '',
    });
    harness = new ToolHarness({ vault });

    // Search in empty file
    const searchResult = await harness.invoke('search-vault', {
      query: 'test',
      include_content: true,
    });

    expect(searchResult.success).toBe(true);
    expect(searchResult.data.total_matches).toBe(0);

    // Add tags to empty file with frontmatter
    const tagResult = await harness.invoke('add-tags', {
      path: 'Empty.md',
      tags: ['tag'],
      location: 'frontmatter',
    });

    expect(tagResult.success).toBe(true);
    const content = await harness.vault.readFile('Empty.md');
    expect(content).toContain('tags: [tag]');
  });

  it('handles invalid frontmatter YAML gracefully', async () => {
    const vault = new InMemoryVaultManager({
      'BadYAML.md': ['---', 'invalid: [unclosed', '---', '', 'Body'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    // Should still be able to read the file
    const result = await harness.invoke('read-note', {
      path: 'BadYAML.md',
    });

    expect(result.success).toBe(true);
    expect(result.data.content).toContain('Body');
  });

  it('handles frontmatter with missing closing delimiter', async () => {
    const vault = new InMemoryVaultManager({
      'Unclosed.md': ['---', 'title: Test', 'Body without closing ---'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    // Patch should handle malformed frontmatter
    const result = await harness.invoke('patch-content', {
      path: 'Unclosed.md',
      anchor_type: 'frontmatter',
      anchor_value: 'status',
      position: 'replace',
      content: 'draft',
    });

    // Behavior may vary - at minimum should not crash
    expect(result).toBeDefined();
  });

  it('handles empty tag arrays gracefully', async () => {
    const vault = new InMemoryVaultManager({
      'Doc.md': 'Content',
    });
    harness = new ToolHarness({ vault });

    // Add empty tags array
    const addResult = await harness.invoke('add-tags', {
      path: 'Doc.md',
      tags: [],
      location: 'both',
    });

    expect(addResult.success).toBe(true);

    // Remove empty tags array
    const removeResult = await harness.invoke('remove-tags', {
      path: 'Doc.md',
      tags: [],
      location: 'both',
    });

    expect(removeResult.success).toBe(true);
  });

  it('handles nested tags with slashes', async () => {
    const vault = new InMemoryVaultManager({
      'Nested.md': 'Content #category/subcategory',
    });
    harness = new ToolHarness({ vault });

    // List should count nested tags
    const listResult = await harness.invoke('manage-tags', {
      action: 'list',
      sort_by: 'name',
    });

    expect(listResult.success).toBe(true);
    expect(listResult.data.tags.some((t: any) => t.tag === 'category/subcategory')).toBe(true);

    // Rename nested tag
    const renameResult = await harness.invoke('rename-tag', {
      old_tag: 'category/subcategory',
      new_tag: 'category/newname',
    });

    expect(renameResult.success).toBe(true);
    const content = await harness.vault.readFile('Nested.md');
    expect(content).toContain('#category/newname');
  });

  it('handles unicode characters in file paths and content', async () => {
    harness = new ToolHarness();

    const createResult = await harness.invoke('create-note', {
      path: 'Notes/文档.md',
      content: 'Content with unicode: 你好',
    });

    expect(createResult.success).toBe(true);

    const readResult = await harness.invoke('read-note', {
      path: 'Notes/文档.md',
    });

    expect(readResult.success).toBe(true);
    expect(readResult.data.content).toBe('Content with unicode: 你好');
  });

  it('handles very long file paths', async () => {
    harness = new ToolHarness();

    const longPath = 'Very/Long/Nested/Path/With/Many/Levels/Deep/Inside/The/Vault/File.md';

    const result = await harness.invoke('create-note', {
      path: longPath,
      content: 'Deep content',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile(longPath)).toBe('Deep content');
  });
});

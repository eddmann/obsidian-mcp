import { afterEach, describe, expect, it } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  harness?.dispose();
});

describe('Tag tool behaviours', () => {
  it('adds tags to frontmatter and inline sections without duplicates', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/tagged.md': ['---', 'tags: [existing]', '---', '', 'Body text #existing'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('add-tags', {
      path: 'Notes/tagged.md',
      tags: ['existing', 'new-tag'],
      location: 'both',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/tagged.md');
    expect(updated).toContain('tags: [existing, new-tag]');
    expect(updated).toContain('#existing #new-tag');
  });

  it('removes tags from both frontmatter and inline regions', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/remove.md': ['---', 'tags: [alpha, beta]', '---', '', 'Some text #alpha #beta'].join(
        '\n',
      ),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('remove-tags', {
      path: 'Notes/remove.md',
      tags: ['beta'],
      location: 'both',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/remove.md');
    expect(updated).toContain('tags: [alpha]');
    expect(updated).not.toContain('#beta');
  });

  it('previews tag rename in dry-run without modifying files', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/rename.md': 'Tag #legacy appears twice. #legacy',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('rename-tag', {
      old_tag: 'legacy',
      new_tag: 'modern',
      dry_run: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      success: true,
      files_affected: ['Notes/rename.md'],
      total_replacements: 2,
      dry_run: true,
    });
    expect(await harness.vault.readFile('Notes/rename.md')).toBe(
      'Tag #legacy appears twice. #legacy',
    );
  });

  it('renames tags across files when not a dry run', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/refactor.md': '#legacy tag in file',
      'Notes/another.md': 'Contains #legacy twice #legacy',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('rename-tag', {
      old_tag: 'legacy',
      new_tag: 'modern',
    });

    expect(result.success).toBe(true);
    expect(result.data.success).toBe(true);
    expect(result.data.total_replacements).toBe(3);
    expect(result.data.dry_run).toBe(false);
    expect(result.data.files_affected).toHaveLength(2);
    expect(result.data.files_affected).toEqual(
      expect.arrayContaining(['Notes/refactor.md', 'Notes/another.md']),
    );
    expect(await harness.vault.readFile('Notes/refactor.md')).toContain('#modern');
    expect(await harness.vault.readFile('Notes/another.md')).not.toContain('#legacy');
  });

  it('lists and counts tags across the vault', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/alpha.md': '#tag-one\n#tag-two',
      'Notes/beta.md': '#tag-one',
    });
    harness = new ToolHarness({ vault });

    const list = await harness.invoke('manage-tags', {
      action: 'list',
      sort_by: 'name',
    });

    expect(list.success).toBe(true);
    expect(list.data).toEqual({
      action: 'list',
      tags: [
        { tag: 'tag-one', count: 2, files: ['Notes/alpha.md', 'Notes/beta.md'] },
        { tag: 'tag-two', count: 1, files: ['Notes/alpha.md'] },
      ],
      total_tags: 2,
    });

    const count = await harness.invoke('manage-tags', {
      action: 'count',
      sort_by: 'count',
    });

    expect(count.success).toBe(true);
    expect(count.data).toEqual({
      action: 'count',
      tags: [
        { tag: 'tag-one', count: 2 },
        { tag: 'tag-two', count: 1 },
      ],
      total_tags: 2,
    });
  });

  it('merges tags by renaming', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/merge.md': 'Mix #old-tag and #other',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('manage-tags', {
      action: 'merge',
      tag: 'old-tag',
      merge_into: 'other',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'merge',
      merged: {
        from: 'old-tag',
        into: 'other',
        files_affected: 1,
      },
    });
    expect(await harness.vault.readFile('Notes/merge.md')).not.toContain('#old-tag');
  });

  it('adds tags to frontmatter only', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/fm-only.md': ['---', 'tags: [existing]', '---', '', 'Body text'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('add-tags', {
      path: 'Notes/fm-only.md',
      tags: ['new-tag'],
      location: 'frontmatter',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/fm-only.md');
    expect(updated).toContain('tags: [existing, new-tag]');
    expect(updated).not.toContain('#new-tag');
  });

  it('adds tags to inline only', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/inline.md': 'Body with #existing tag',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('add-tags', {
      path: 'Notes/inline.md',
      tags: ['new-tag'],
      location: 'inline',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/inline.md');
    expect(updated).toContain('#new-tag');
    expect(updated).not.toContain('tags:');
  });

  it('adds duplicate tags when deduplicate is false', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/dup.md': ['---', 'tags: [test]', '---', ''].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('add-tags', {
      path: 'Notes/dup.md',
      tags: ['test', 'test'],
      location: 'frontmatter',
      deduplicate: false,
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/dup.md');
    expect(updated).toContain('tags: [test, test, test]');
  });

  it('creates frontmatter when adding tags to file without it', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/no-fm.md': 'Just body content',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('add-tags', {
      path: 'Notes/no-fm.md',
      tags: ['new-tag'],
      location: 'frontmatter',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/no-fm.md');
    expect(updated).toMatch(/^---\ntags: \[new-tag\]\n---\n/);
    expect(updated).toContain('Just body content');
  });

  it('removes tags from frontmatter only', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/rm-fm.md': ['---', 'tags: [alpha, beta]', '---', '', '#alpha #beta'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('remove-tags', {
      path: 'Notes/rm-fm.md',
      tags: ['beta'],
      location: 'frontmatter',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/rm-fm.md');
    expect(updated).toContain('tags: [alpha]');
    expect(updated).toContain('#beta');
  });

  it('removes tags from inline only', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/rm-inline.md': ['---', 'tags: [alpha, beta]', '---', '', '#alpha #beta'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('remove-tags', {
      path: 'Notes/rm-inline.md',
      tags: ['beta'],
      location: 'inline',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/rm-inline.md');
    expect(updated).toContain('tags: [alpha, beta]');
    expect(updated).toContain('#alpha');
    expect(updated).not.toContain('#beta');
  });

  it('handles removing non-existent tags gracefully', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/no-tag.md': ['---', 'tags: [existing]', '---', '', '#existing'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('remove-tags', {
      path: 'Notes/no-tag.md',
      tags: ['non-existent'],
      location: 'both',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/no-tag.md');
    expect(updated).toContain('tags: [existing]');
    expect(updated).toContain('#existing');
  });

  it('renames tags with case-sensitive matching', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/case.md': '#Test #test #TEST',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('rename-tag', {
      old_tag: 'test',
      new_tag: 'renamed',
      case_sensitive: true,
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/case.md');
    expect(updated).toContain('#Test');
    expect(updated).toContain('#renamed');
    expect(updated).toContain('#TEST');
    expect(result.data.total_replacements).toBe(1);
  });

  it('returns zero replacements when renaming non-existent tag', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/doc.md': '#existing',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('rename-tag', {
      old_tag: 'non-existent',
      new_tag: 'renamed',
    });

    expect(result.success).toBe(true);
    expect(result.data.total_replacements).toBe(0);
    expect(result.data.files_affected).toHaveLength(0);
  });

  it('sorts tags by count in descending order', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/a.md': '#frequent\n#frequent\n#rare',
      'Notes/b.md': '#frequent',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('manage-tags', {
      action: 'count',
      sort_by: 'count',
    });

    expect(result.success).toBe(true);
    expect(result.data.tags[0].tag).toBe('frequent');
    expect(result.data.tags[0].count).toBe(2);
    expect(result.data.tags[1].tag).toBe('rare');
    expect(result.data.tags[1].count).toBe(1);
  });
});

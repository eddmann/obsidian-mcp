import { afterEach, describe, expect, it } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  harness?.dispose();
});

describe('Patch content behaviours', () => {
  it('inserts content relative to a heading', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/heading.md': ['# Title', '', '## Target', 'Body line', '', '## After'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/heading.md',
      anchor_type: 'heading',
      anchor_value: 'Target',
      position: 'after',
      content: 'Inserted under target',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/heading.md');
    expect(updated).toContain('## Target\nInserted under target\nBody line');
  });

  it('replaces a specific line number', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/lines.md': ['First', 'Second', 'Third'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/lines.md',
      anchor_type: 'line',
      anchor_value: '2',
      position: 'replace',
      content: 'Replacement',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Notes/lines.md')).toBe(
      ['First', 'Replacement', 'Third'].join('\n'),
    );
  });

  it('adds content adjacent to a block identifier', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/block.md': ['Paragraph one', '^block-id', 'Paragraph two'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/block.md',
      anchor_type: 'block',
      anchor_value: 'block-id',
      position: 'before',
      content: 'Inserted block content',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/block.md');
    expect(updated).toContain('Inserted block content\n^block-id');
  });

  it('creates or updates frontmatter entries', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/frontmatter.md': ['---', 'title: Sample', '---', '', 'Body'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/frontmatter.md',
      anchor_type: 'frontmatter',
      anchor_value: 'status',
      position: 'replace',
      content: 'in-progress',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/frontmatter.md');
    expect(updated).toContain('status: in-progress');
    expect(updated.startsWith('---')).toBe(true);
  });

  it('inserts content before a heading', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/heading.md': ['# Title', '', '## Section', 'Content'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/heading.md',
      anchor_type: 'heading',
      anchor_value: 'Section',
      position: 'before',
      content: 'Before section',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/heading.md');
    expect(updated).toContain('Before section\n## Section');
  });

  it('replaces content under a heading until next heading', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/sections.md': [
        '## First',
        'Old content',
        'More old',
        '',
        '## Second',
        'Keep this',
      ].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/sections.md',
      anchor_type: 'heading',
      anchor_value: 'First',
      position: 'replace',
      content: 'New content',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/sections.md');
    expect(updated).toContain('## First\nNew content\n## Second');
    expect(updated).toContain('Keep this');
    expect(updated).not.toContain('Old content');
  });

  it('inserts content before a specific line number', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/lines.md': ['Line 1', 'Line 2', 'Line 3'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/lines.md',
      anchor_type: 'line',
      anchor_value: '2',
      position: 'before',
      content: 'Inserted',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Notes/lines.md')).toBe(
      ['Line 1', 'Inserted', 'Line 2', 'Line 3'].join('\n'),
    );
  });

  it('inserts content after a specific line number', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/lines.md': ['Line 1', 'Line 2', 'Line 3'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/lines.md',
      anchor_type: 'line',
      anchor_value: '2',
      position: 'after',
      content: 'Inserted',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Notes/lines.md')).toBe(
      ['Line 1', 'Line 2', 'Inserted', 'Line 3'].join('\n'),
    );
  });

  it('replaces a block identifier', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/blocks.md': ['Text before', '^block-id', 'Text after'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/blocks.md',
      anchor_type: 'block',
      anchor_value: 'block-id',
      position: 'replace',
      content: 'Replaced block',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/blocks.md');
    expect(updated).toContain('Replaced block');
    expect(updated).not.toContain('^block-id');
  });

  it('fails when file does not exist and create_if_missing is false', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('patch-content', {
      path: 'Missing.md',
      anchor_type: 'heading',
      anchor_value: 'Test',
      position: 'after',
      content: 'New content',
      create_if_missing: false,
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('does not exist');
  });

  it('fails when heading is not found', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/doc.md': '# Existing\n\nContent',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/doc.md',
      anchor_type: 'heading',
      anchor_value: 'NonExistent',
      position: 'after',
      content: 'New content',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('not found');
  });

  it('fails when block identifier is not found', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/doc.md': 'Some content',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/doc.md',
      anchor_type: 'block',
      anchor_value: 'missing-block',
      position: 'after',
      content: 'New content',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('not found');
  });

  it('fails when line number is out of bounds', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/short.md': 'Line 1\nLine 2',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/short.md',
      anchor_type: 'line',
      anchor_value: '10',
      position: 'replace',
      content: 'New content',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('out of range');
  });

  it('creates frontmatter when file has no frontmatter', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/plain.md': 'Just body content',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/plain.md',
      anchor_type: 'frontmatter',
      anchor_value: 'title',
      position: 'replace',
      content: 'New Title',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/plain.md');
    expect(updated).toMatch(/^---\ntitle: New Title\n---\n/);
    expect(updated).toContain('Just body content');
  });

  it('updates existing frontmatter value', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/meta.md': ['---', 'title: Old Title', 'tags: [one]', '---', 'Body'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/meta.md',
      anchor_type: 'frontmatter',
      anchor_value: 'title',
      position: 'replace',
      content: 'Updated Title',
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Notes/meta.md');
    expect(updated).toContain('title: Updated Title');
    expect(updated).toContain('tags: [one]');
    expect(updated).not.toContain('Old Title');
  });
});

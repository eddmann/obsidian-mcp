import { afterEach, describe, expect, it } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  harness?.dispose();
});

describe('Apply diff patch behaviors', () => {
  it('applies a simple single-line change', async () => {
    const vault = new InMemoryVaultManager({
      'test.md': 'Line 1\nLine 2\nLine 3',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'test.md',
      diff: '@@ -2,1 +2,1 @@\n-Line 2\n+Modified Line 2',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('test.md')).toBe('Line 1\nModified Line 2\nLine 3');
  });

  it('applies a multi-line addition', async () => {
    const vault = new InMemoryVaultManager({
      'note.md': 'Start\nEnd',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'note.md',
      diff: '@@ -1,2 +1,4 @@\n Start\n+New line 1\n+New line 2\n End',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('note.md')).toBe('Start\nNew line 1\nNew line 2\nEnd');
  });

  it('applies a multi-line deletion', async () => {
    const vault = new InMemoryVaultManager({
      'note.md': 'Line 1\nLine 2\nLine 3\nLine 4',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'note.md',
      diff: '@@ -2,2 +2,0 @@\n-Line 2\n-Line 3',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('note.md')).toBe('Line 1\nLine 4');
  });

  it('applies multi-hunk diff', async () => {
    const vault = new InMemoryVaultManager({
      'doc.md': 'Section 1\nContent 1\n\nSection 2\nContent 2',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'doc.md',
      diff: '@@ -1,2 +1,2 @@\n Section 1\n-Content 1\n+Modified 1\n@@ -4,2 +4,2 @@\n Section 2\n-Content 2\n+Modified 2',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('doc.md')).toBe('Section 1\nModified 1\n\nSection 2\nModified 2');
  });

  it('returns change preview with context', async () => {
    const vault = new InMemoryVaultManager({
      'preview.md': 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5\nLine 6',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'preview.md',
      diff: '@@ -3,1 +3,1 @@\n-Line 3\n+Modified 3',
    });

    expect(result.success).toBe(true);
    expect(result.data.change_preview).toBeDefined();
    expect(result.data.change_preview.line_range).toEqual({ start: 3, end: 3 });
    expect(result.data.change_preview.changed_content).toEqual(['Modified 3']);
    expect(result.data.change_preview.context_before).toEqual(['Line 1', 'Line 2']);
    expect(result.data.change_preview.context_after).toEqual(['Line 4', 'Line 5']);
  });

  it('fails when file does not exist', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('apply-diff-patch', {
      path: 'missing.md',
      diff: '@@ -1,1 +1,1 @@\n-Old\n+New',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('does not exist');
  });

  it('fails when diff does not match file content', async () => {
    const vault = new InMemoryVaultManager({
      'test.md': 'Actual content',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'test.md',
      diff: '@@ -1,1 +1,1 @@\n-Different content\n+New content',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('Failed to apply patch');
    expect(result.text).toContain('not match');
  });

  it('handles diff at start of file', async () => {
    const vault = new InMemoryVaultManager({
      'start.md': 'First\nSecond\nThird',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'start.md',
      diff: '@@ -1,1 +1,1 @@\n-First\n+Modified First',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('start.md')).toBe('Modified First\nSecond\nThird');
  });

  it('handles diff at end of file', async () => {
    const vault = new InMemoryVaultManager({
      'end.md': 'First\nSecond\nThird',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'end.md',
      diff: '@@ -3,1 +3,1 @@\n-Third\n+Modified Third',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('end.md')).toBe('First\nSecond\nModified Third');
  });

  it('applies addition at beginning', async () => {
    const vault = new InMemoryVaultManager({
      'add.md': 'Original line',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'add.md',
      diff: '@@ -1,1 +1,2 @@\n+Added line\n Original line',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('add.md')).toBe('Added line\nOriginal line');
  });

  it('applies deletion at end', async () => {
    const vault = new InMemoryVaultManager({
      'delete.md': 'Keep this\nDelete this',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'delete.md',
      diff: '@@ -1,2 +1,1 @@\n Keep this\n-Delete this',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('delete.md')).toBe('Keep this');
  });

  it('handles context lines correctly', async () => {
    const vault = new InMemoryVaultManager({
      'context.md': 'Line A\nLine B\nLine C\nLine D',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'context.md',
      diff: '@@ -2,3 +2,3 @@\n Line B\n-Line C\n+Modified C\n Line D',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('context.md')).toBe('Line A\nLine B\nModified C\nLine D');
  });

  it('handles empty file to single line', async () => {
    const vault = new InMemoryVaultManager({
      'empty.md': '',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'empty.md',
      diff: '@@ -0,0 +1,1 @@\n+New line',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('empty.md')).toBe('New line\n');
  });

  it('applies replacement with different length', async () => {
    const vault = new InMemoryVaultManager({
      'replace.md': 'Short',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'replace.md',
      diff: '@@ -1,1 +1,1 @@\n-Short\n+Much longer replacement line',
    });

    expect(result.success).toBe(true);
    expect(await vault.readFile('replace.md')).toBe('Much longer replacement line');
  });

  it('preview shows limited context at file boundaries', async () => {
    const vault = new InMemoryVaultManager({
      'boundary.md': 'Line 1\nLine 2',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'boundary.md',
      diff: '@@ -1,1 +1,1 @@\n-Line 1\n+Modified 1',
    });

    expect(result.success).toBe(true);
    expect(result.data.change_preview.context_before).toEqual([]);
    expect(result.data.change_preview.context_after.length).toBeLessThanOrEqual(2);
  });

  it('fails with invalid diff format (garbage input)', async () => {
    const vault = new InMemoryVaultManager({
      'test.md': 'Some content',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'test.md',
      diff: 'this is not a valid diff format at all',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('Invalid diff format');
    expect(result.text).toContain('unified diff format');
  });

  it('fails with malformed diff header', async () => {
    const vault = new InMemoryVaultManager({
      'test.md': 'Line 1\nLine 2',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'test.md',
      diff: '@@@ invalid header @@@\n-Line 1\n+Modified',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('Invalid diff format');
    expect(result.text).toContain('hunk header');
  });

  it('fails with diff missing hunk header', async () => {
    const vault = new InMemoryVaultManager({
      'test.md': 'Line 1\nLine 2\nLine 3',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('apply-diff-patch', {
      path: 'test.md',
      diff: '-Line 2\n+Modified Line 2',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('Invalid diff format');
    expect(result.text).toContain('hunk header');
  });
});

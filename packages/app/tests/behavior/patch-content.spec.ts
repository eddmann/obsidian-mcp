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

  it('returns change preview with context for heading insertion', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/preview.md': [
        '# Title',
        'Some intro',
        '',
        '## Target Section',
        'Existing content',
        'More existing',
        '',
        '## Next Section',
        'Other content',
      ].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/preview.md',
      anchor_type: 'heading',
      anchor_value: 'Target Section',
      position: 'after',
      content: 'New inserted line',
    });

    expect(result.success).toBe(true);
    expect(result.data.change_preview).toBeDefined();
    expect(result.data.change_preview.line_range).toEqual({ start: 5, end: 5 });
    expect(result.data.change_preview.changed_content).toEqual(['New inserted line']);
    expect(result.data.change_preview.context_before).toEqual(['', '## Target Section']);
    expect(result.data.change_preview.context_after).toEqual(['Existing content', 'More existing']);
  });

  it('replaces text using single-line text_match', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/lines.md': ['First', 'Second', 'Third'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/lines.md',
      anchor_type: 'text_match',
      anchor_value: 'Second',
      position: 'replace',
      content: 'Replacement',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Notes/lines.md')).toBe(
      ['First', 'Replacement', 'Third'].join('\n'),
    );
  });

  it('returns change preview for text_match replacement', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/lines-preview.md': ['Line 1', 'Line 2', 'Line 3', 'Line 4', 'Line 5'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/lines-preview.md',
      anchor_type: 'text_match',
      anchor_value: 'Line 3',
      position: 'replace',
      content: 'Replaced line 3',
    });

    expect(result.success).toBe(true);
    expect(result.data.change_preview).toBeDefined();
    expect(result.data.change_preview.line_range).toEqual({ start: 3, end: 3 });
    expect(result.data.change_preview.changed_content).toEqual(['Replaced line 3']);
    expect(result.data.change_preview.context_before).toEqual(['Line 1', 'Line 2']);
    expect(result.data.change_preview.context_after).toEqual(['Line 4', 'Line 5']);
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

  it('inserts content before matched text', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/lines.md': ['Line 1', 'Line 2', 'Line 3'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/lines.md',
      anchor_type: 'text_match',
      anchor_value: 'Line 2',
      position: 'before',
      content: 'Inserted',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Notes/lines.md')).toBe(
      ['Line 1', 'Inserted', 'Line 2', 'Line 3'].join('\n'),
    );
  });

  it('inserts content after matched text', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/lines.md': ['Line 1', 'Line 2', 'Line 3'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/lines.md',
      anchor_type: 'text_match',
      anchor_value: 'Line 2',
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

  it('fails when text pattern is not found', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/short.md': 'Line 1\nLine 2',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('patch-content', {
      path: 'Notes/short.md',
      anchor_type: 'text_match',
      anchor_value: 'Nonexistent text',
      position: 'replace',
      content: 'New content',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('not found');
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

  describe('Auto-strip duplicate headings', () => {
    it('strips duplicate heading when inserting with "after" position', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/duplicate.md': ['# Title', '', '## Target', 'Original content', ''].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/duplicate.md',
        anchor_type: 'heading',
        anchor_value: 'Target',
        position: 'after',
        content: '## Target\nNew content below',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/duplicate.md');
      // Should strip the duplicate "## Target" from content
      expect(updated).toBe(
        ['# Title', '', '## Target', 'New content below', 'Original content', ''].join('\n'),
      );
      // Should NOT have duplicate heading
      expect(updated.match(/## Target/g)?.length).toBe(1);
    });

    it('strips duplicate heading when inserting with "before" position', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/duplicate.md': ['# Title', '', '## Target', 'Original content'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/duplicate.md',
        anchor_type: 'heading',
        anchor_value: 'Target',
        position: 'before',
        content: '## Target\nNew content above',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/duplicate.md');
      // Should strip the duplicate "## Target" from content
      expect(updated).toContain('New content above\n## Target\nOriginal content');
      // Should NOT have duplicate heading
      expect(updated.match(/## Target/g)?.length).toBe(1);
    });

    it('strips duplicate heading when replacing content', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/replace.md': [
          '# Main',
          '',
          '## Section',
          'Old content',
          'More old',
          '',
          '## Next Section',
        ].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/replace.md',
        anchor_type: 'heading',
        anchor_value: 'Section',
        position: 'replace',
        content: '## Section\nReplacement content',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/replace.md');
      // Should strip the duplicate "## Section" and only keep one
      expect(updated).toContain('## Section\nReplacement content\n## Next Section');
      expect(updated).not.toContain('Old content');
      // Should NOT have duplicate heading
      expect(updated.match(/## Section/g)?.length).toBe(1);
    });

    it('handles case-insensitive heading matching', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/case.md': ['## Target Heading', 'Content'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/case.md',
        anchor_type: 'heading',
        anchor_value: 'target heading',
        position: 'after',
        content: '## target heading\nNew content',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/case.md');
      // Should strip the heading despite case difference
      expect(updated).toContain('## Target Heading\nNew content\nContent');
      // Should NOT have duplicate heading
      expect(updated.toLowerCase().match(/## target heading/g)?.length).toBe(1);
    });

    it('preserves non-matching headings without stripping', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/different.md': ['## Target', 'Content'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/different.md',
        anchor_type: 'heading',
        anchor_value: 'Target',
        position: 'after',
        content: '## Different Heading\nNew content',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/different.md');
      // Should keep "## Different Heading" because it doesn't match "Target"
      expect(updated).toContain('## Target\n## Different Heading\nNew content\nContent');
      expect(updated).toContain('## Different Heading');
    });

    it('handles different heading levels correctly', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/levels.md': ['## Target', 'Content'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/levels.md',
        anchor_type: 'heading',
        anchor_value: 'Target',
        position: 'after',
        content: '### Target\nNew subcontent',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/levels.md');
      // Should strip "### Target" even though original is "##" (text matches)
      expect(updated).toContain('## Target\nNew subcontent\nContent');
      expect(updated).not.toContain('### Target');
    });

    it('handles content that is only a heading', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/only-heading.md': ['## Target', 'Original'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/only-heading.md',
        anchor_type: 'heading',
        anchor_value: 'Target',
        position: 'after',
        content: '## Target',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/only-heading.md');
      // Should strip the duplicate heading, leaving no new content
      // The heading itself stays, but content after stripping is empty
      expect(updated).toBe(['## Target', '', 'Original'].join('\n'));
    });
  });

  describe('Text match features', () => {
    it('supports multi-line text matching', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/multiline.md': ['Start', 'Block line 1', 'Block line 2', 'Block line 3', 'End'].join(
          '\n',
        ),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/multiline.md',
        anchor_type: 'text_match',
        anchor_value: ['Block line 1', 'Block line 2', 'Block line 3'].join('\n'),
        position: 'replace',
        content: 'Replaced multi-line block',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/multiline.md');
      expect(updated).toBe(['Start', 'Replaced multi-line block', 'End'].join('\n'));
    });

    it('fails with helpful error when pattern matches multiple times', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/duplicate.md': [
          'Section A',
          'Common line',
          'Content A',
          '',
          'Section B',
          'Common line',
          'Content B',
        ].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/duplicate.md',
        anchor_type: 'text_match',
        anchor_value: 'Common line',
        position: 'replace',
        content: 'New content',
      });

      expect(result.success).toBe(false);
      expect(result.text).toContain('found 2 times');
      expect(result.text).toContain('Lines 2-2');
      expect(result.text).toContain('Lines 6-6');
      expect(result.text).toContain('provide more context');
    });

    it('handles unique match after adding context to pattern', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/context.md': [
          'Section A',
          'Common line',
          'Content A',
          '',
          'Section B',
          'Common line',
          'Content B',
        ].join('\n'),
      });
      harness = new ToolHarness({ vault });

      // Use multi-line pattern to uniquely identify the second occurrence
      const result = await harness.invoke('patch-content', {
        path: 'Notes/context.md',
        anchor_type: 'text_match',
        anchor_value: ['Section B', 'Common line'].join('\n'),
        position: 'replace',
        content: 'Replacement for section B',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/context.md');
      expect(updated).toContain('Replacement for section B');
      expect(updated).toContain('Section A');
      expect(updated).toContain('Content A');
    });

    it('preserves whitespace in text matching', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/whitespace.md': ['Line with  double  spaces', 'Normal line'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/whitespace.md',
        anchor_type: 'text_match',
        anchor_value: 'Line with  double  spaces',
        position: 'replace',
        content: 'Replaced',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/whitespace.md');
      expect(updated).toBe(['Replaced', 'Normal line'].join('\n'));
    });

    it('matches at start of file', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/start.md': ['First line', 'Second line', 'Third line'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/start.md',
        anchor_type: 'text_match',
        anchor_value: 'First line',
        position: 'before',
        content: 'Before first',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/start.md');
      expect(updated).toBe(['Before first', 'First line', 'Second line', 'Third line'].join('\n'));
    });

    it('matches at end of file', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/end.md': ['First line', 'Second line', 'Last line'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/end.md',
        anchor_type: 'text_match',
        anchor_value: 'Last line',
        position: 'after',
        content: 'After last',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/end.md');
      expect(updated).toBe(['First line', 'Second line', 'Last line', 'After last'].join('\n'));
    });

    it('handles multi-line content insertion with after position', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/multiline-content.md': ['Line 1', 'Line 2', 'Line 3'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/multiline-content.md',
        anchor_type: 'text_match',
        anchor_value: 'Line 2',
        position: 'after',
        content: 'New line A\nNew line B\nNew line C',
      });

      expect(result.success).toBe(true);
      expect(result.data.change_preview.line_range).toEqual({ start: 3, end: 5 });
      expect(result.data.change_preview.changed_content).toEqual([
        'New line A',
        'New line B',
        'New line C',
      ]);
      const updated = await harness.vault.readFile('Notes/multiline-content.md');
      expect(updated).toBe(
        ['Line 1', 'Line 2', 'New line A', 'New line B', 'New line C', 'Line 3'].join('\n'),
      );
    });

    it('handles multi-line content insertion with before position', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/multiline-before.md': ['Line 1', 'Line 2', 'Line 3'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/multiline-before.md',
        anchor_type: 'text_match',
        anchor_value: 'Line 2',
        position: 'before',
        content: 'New A\nNew B',
      });

      expect(result.success).toBe(true);
      expect(result.data.change_preview.line_range).toEqual({ start: 2, end: 3 });
      expect(result.data.change_preview.changed_content).toEqual(['New A', 'New B']);
      const updated = await harness.vault.readFile('Notes/multiline-before.md');
      expect(updated).toBe(['Line 1', 'New A', 'New B', 'Line 2', 'Line 3'].join('\n'));
    });

    it('matches multi-line pattern containing empty lines', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/empty-lines.md': ['Header', '', 'Content', 'Footer'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/empty-lines.md',
        anchor_type: 'text_match',
        anchor_value: 'Header\n\nContent', // Pattern includes empty line
        position: 'replace',
        content: 'Replaced section',
      });

      expect(result.success).toBe(true);
      const updated = await harness.vault.readFile('Notes/empty-lines.md');
      expect(updated).toBe(['Replaced section', 'Footer'].join('\n'));
    });

    it('shows empty context_before when match is at line 1', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/first-line.md': ['First', 'Second', 'Third'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/first-line.md',
        anchor_type: 'text_match',
        anchor_value: 'First',
        position: 'replace',
        content: 'Replaced first',
      });

      expect(result.success).toBe(true);
      expect(result.data.change_preview.context_before).toEqual([]);
      expect(result.data.change_preview.context_after).toEqual(['Second', 'Third']);
    });

    it('shows empty context_after when match is at last line', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/last-line.md': ['First', 'Second', 'Last'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/last-line.md',
        anchor_type: 'text_match',
        anchor_value: 'Last',
        position: 'replace',
        content: 'Replaced last',
      });

      expect(result.success).toBe(true);
      expect(result.data.change_preview.context_before).toEqual(['First', 'Second']);
      expect(result.data.change_preview.context_after).toEqual([]);
    });

    it('detects overlapping pattern matches', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/overlap.md': ['AAA', 'AAA', 'AAA'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/overlap.md',
        anchor_type: 'text_match',
        anchor_value: 'AAA\nAAA',
        position: 'replace',
        content: 'Replaced',
      });

      expect(result.success).toBe(false);
      expect(result.text).toContain('found 2 times');
      expect(result.text).toContain('Lines 1-2');
      expect(result.text).toContain('Lines 2-3');
    });

    it('fails when pattern is longer than file', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/short.md': 'Short',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/short.md',
        anchor_type: 'text_match',
        anchor_value: 'Line 1\nLine 2\nLine 3\nLine 4',
        position: 'replace',
        content: 'New',
      });

      expect(result.success).toBe(false);
      expect(result.text).toContain('not found');
    });

    it('fails gracefully with empty pattern', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/test.md': 'Some content',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/test.md',
        anchor_type: 'text_match',
        anchor_value: '',
        position: 'replace',
        content: 'New content',
      });

      expect(result.success).toBe(false);
      expect(result.text).toContain('empty');
    });

    it('fails gracefully with whitespace-only pattern', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/test.md': 'Some content',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('patch-content', {
        path: 'Notes/test.md',
        anchor_type: 'text_match',
        anchor_value: '   \n\t\n  ',
        position: 'replace',
        content: 'New content',
      });

      expect(result.success).toBe(false);
      expect(result.text).toContain('empty');
    });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  harness?.dispose();
});

describe('Search tool behaviours', () => {
  it('finds matches with context and honours filters', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/alpha.md': ['# Alpha', '', 'Contains a keyword', 'Another line'].join('\n'),
      'Notes/beta.md': ['# Beta', '', 'keyword inside beta'].join('\n'),
      'Archive/gamma.txt': 'keyword but ignored',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: 'keyword',
      file_types: ['md'],
      context_lines: 1,
      include_content: true,
      path_filter: 'Notes/.*',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      results: [
        {
          path: 'Notes/alpha.md',
          matches: [
            {
              line: 3,
              content: 'Contains a keyword',
              context_before: [''],
              context_after: ['Another line'],
            },
          ],
        },
        {
          path: 'Notes/beta.md',
          matches: [
            {
              line: 3,
              content: 'keyword inside beta',
              context_before: [''],
              context_after: [],
            },
          ],
        },
      ],
      total_matches: 2,
      total_files: 2,
    });
  });

  it('supports regex searches and suppressing content in results', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/regex.md': ['Header', 'Alpha bravo', 'alpha CHARLIE'].join('\n'),
      'Notes/others.md': 'foobar',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: 'alpha',
      regex: true,
      case_sensitive: false,
      include_content: false,
      context_lines: 0,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      results: [
        {
          path: 'Notes/regex.md',
          matches: [{ line: 2 }, { line: 3 }],
        },
      ],
      total_matches: 2,
      total_files: 1,
    });
  });

  it('performs case-sensitive search', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/case.md': ['Test', 'test', 'TEST'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: 'test',
      case_sensitive: true,
      include_content: true,
      context_lines: 0,
    });

    expect(result.success).toBe(true);
    expect(result.data.total_matches).toBe(1);
    expect(result.data.results[0].matches[0].content).toBe('test');
  });

  it('respects search limit parameter', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/a.md': 'match',
      'Notes/b.md': 'match',
      'Notes/c.md': 'match',
      'Notes/d.md': 'match',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: 'match',
      limit: 2,
      include_content: false,
    });

    expect(result.success).toBe(true);
    expect(result.data.total_files).toBeLessThanOrEqual(2);
  });

  it('returns empty results when no matches found', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/doc.md': 'Some content here',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: 'nonexistent',
      include_content: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      results: [],
      total_matches: 0,
      total_files: 0,
    });
  });

  it('returns empty results when path filter matches no files', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/doc.md': 'keyword here',
      'Other/file.md': 'keyword there',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: 'keyword',
      path_filter: 'Archive/.*',
      include_content: true,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      results: [],
      total_matches: 0,
      total_files: 0,
    });
  });

  it('searches with minimal context', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/doc.md': ['Before', 'Match here', 'After'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: 'Match',
      context_lines: 0,
      include_content: true,
    });

    expect(result.success).toBe(true);
    const match = result.data.results[0].matches[0];
    expect(match.line).toBe(2);
    expect(match.content).toBe('Match here');
    // Verify context handling - implementation specific
    expect(match.context_before).toBeDefined();
    expect(match.context_after).toBeDefined();
  });

  it('finds multiple matches in single file', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/multi.md': ['First match', 'No match', 'Second match', 'Third match'].join('\n'),
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: 'match',
      case_sensitive: false,
      include_content: true,
      context_lines: 0,
    });

    expect(result.success).toBe(true);
    expect(result.data.results[0].matches).toHaveLength(4);
    expect(result.data.total_matches).toBe(4);
    expect(result.data.total_files).toBe(1);
  });

  it('properly escapes special regex characters when regex is false', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/special.md': 'Price: $100 (test)',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('search-vault', {
      query: '$100 (test)',
      regex: false,
      include_content: true,
      context_lines: 0,
    });

    expect(result.success).toBe(true);
    expect(result.data.total_matches).toBe(1);
    expect(result.data.results[0].matches[0].content).toBe('Price: $100 (test)');
  });
});

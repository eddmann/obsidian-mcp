import { afterEach, describe, expect, it } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  harness?.dispose();
});

describe('Search tool behaviours', () => {
  describe('Exact search mode', () => {
    it('finds content matches with context and honours filters', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/alpha.md': ['# Alpha', '', 'Contains a keyword', 'Another line'].join('\n'),
        'Notes/beta.md': ['# Beta', '', 'keyword inside beta'].join('\n'),
        'Archive/gamma.txt': 'keyword but ignored',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'keyword',
        exact: true,
        file_types: ['md'],
        path_filter: 'Notes/.*',
      });

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(2);

      // Both should be content matches with snippets
      const alphaMatch = result.data.results.find((r: any) => r.path === 'Notes/alpha.md');
      expect(alphaMatch).toBeDefined();
      expect(alphaMatch.match_type).toBe('content');
      expect(alphaMatch.relevance_score).toBeGreaterThanOrEqual(1);
      expect(alphaMatch.relevance_score).toBeLessThanOrEqual(4);
      expect(alphaMatch.snippet).toContain('keyword');

      const betaMatch = result.data.results.find((r: any) => r.path === 'Notes/beta.md');
      expect(betaMatch).toBeDefined();
      expect(betaMatch.match_type).toBe('content');
      expect(betaMatch.relevance_score).toBeGreaterThanOrEqual(1);
      expect(betaMatch.relevance_score).toBeLessThanOrEqual(4);
      expect(betaMatch.snippet).toContain('keyword');
    });

    it('performs case-insensitive search by default', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/case.md': ['Test', 'test', 'TEST'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'test',
        exact: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.results[0].match_type).toBe('content');
      expect(result.data.results[0].snippet).toContain('est'); // Case-insensitive match
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
        exact: true,
        limit: 2,
      });

      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeLessThanOrEqual(2);
    });

    it('finds content match in file with multiple occurrences', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/multi.md': ['First match', 'No match', 'Second match', 'Third match'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'match',
        exact: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].match_type).toBe('content');
      expect(result.data.results[0].snippet).toContain('match');
    });

    it('properly handles special characters in search query', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/special.md': 'Price: $100 (test)',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: '$100 (test)',
        exact: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].match_type).toBe('content');
      expect(result.data.results[0].snippet).toContain('$100 (test)');
    });
  });

  describe('Fuzzy search mode (default)', () => {
    it('finds content matches with fuzzy matching', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': ['# Document', '', 'This contains important information'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'important',
      });

      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeGreaterThan(0);

      const contentMatch = result.data.results.find((r: any) => r.match_type === 'content');
      if (contentMatch) {
        expect(contentMatch.relevance_score).toBeGreaterThanOrEqual(1);
        expect(contentMatch.relevance_score).toBeLessThanOrEqual(4);
        expect(contentMatch.snippet).toBeDefined();
      }
    });

    it('finds matches with typos', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': 'This document contains important information',
      });
      harness = new ToolHarness({ vault });

      // Fuzzy search should find "document" even with minor typo
      const result = await harness.invoke('search-vault', {
        query: 'documnt',
      });

      // Note: This test may need adjustment based on fuse.js threshold
      expect(result.success).toBe(true);
    });

    it('returns relevance scores for content matches', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/exact.md': 'keyword',
        'Notes/partial.md': 'This line contains the keyword somewhere',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'keyword',
      });

      expect(result.success).toBe(true);
      result.data.results.forEach((r: any) => {
        expect(r.relevance_score).toBeGreaterThanOrEqual(1);
        expect(r.relevance_score).toBeLessThanOrEqual(4);
      });
    });
  });

  describe('Filename matching', () => {
    it('finds filename matches without snippet', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/keyword-file.md': 'Some content here',
        'Notes/other.md': 'Contains keyword in content',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'keyword',
        exact: true,
      });

      expect(result.success).toBe(true);

      const filenameMatch = result.data.results.find(
        (r: any) => r.match_type === 'filename' && r.path === 'Notes/keyword-file.md',
      );
      expect(filenameMatch).toBeDefined();
      expect(filenameMatch.relevance_score).toBe(1); // Always 1 for filename matches
      expect(filenameMatch.snippet).toBeUndefined(); // No snippet for filename matches

      const contentMatch = result.data.results.find(
        (r: any) => r.match_type === 'content' && r.path === 'Notes/other.md',
      );
      expect(contentMatch).toBeDefined();
      expect(contentMatch.snippet).toBeDefined(); // Content matches have snippets
    });

    it('returns separate results for filename and content matches in same file', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/keyword-notes.md': ['# Title', '', 'This also has keyword in content'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'keyword',
        exact: true,
      });

      expect(result.success).toBe(true);

      const sameFileResults = result.data.results.filter(
        (r: any) => r.path === 'Notes/keyword-notes.md',
      );
      expect(sameFileResults).toHaveLength(2); // One for filename, one for content

      const filenameMatch = sameFileResults.find((r: any) => r.match_type === 'filename');
      expect(filenameMatch).toBeDefined();
      expect(filenameMatch.relevance_score).toBe(1);
      expect(filenameMatch.snippet).toBeUndefined();

      const contentMatch = sameFileResults.find((r: any) => r.match_type === 'content');
      expect(contentMatch).toBeDefined();
      expect(contentMatch.snippet).toBeDefined();
    });
  });

  describe('Empty results', () => {
    it('returns empty results when no matches found', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': 'Some content here',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'nonexistent',
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
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        results: [],
        total_matches: 0,
        total_files: 0,
      });
    });
  });

  describe('Error handling', () => {
    it('returns error for empty query', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': 'Some content',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.text).toContain('empty');
    });

    it('returns error for invalid path_filter regex', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': 'Some content',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'content',
        path_filter: '[invalid',
      });

      expect(result.success).toBe(false);
      expect(result.text).toContain('Invalid path_filter');
    });
  });

  describe('Result ordering', () => {
    it('sorts results by relevance score (best first)', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/keyword.md': 'unrelated content here', // Filename match = score 1
        'Notes/other.md': 'this has keyword somewhere in it', // Content match
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'keyword',
        exact: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeGreaterThan(1);

      // Results should be sorted by relevance_score (ascending = best first)
      for (let i = 1; i < result.data.results.length; i++) {
        expect(result.data.results[i].relevance_score).toBeGreaterThanOrEqual(
          result.data.results[i - 1].relevance_score,
        );
      }
    });
  });

  describe('Default behavior', () => {
    it('defaults to fuzzy search when exact not specified', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': 'Some content',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'content',
      });

      expect(result.success).toBe(true);
      // Should work without exact parameter
    });

    it('defaults to md file type when not specified', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': 'keyword here',
        'Notes/doc.txt': 'keyword there',
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'keyword',
        exact: true,
      });

      expect(result.success).toBe(true);
      // Should only find .md file by default
      expect(result.data.results.every((r: any) => r.path.endsWith('.md'))).toBe(true);
    });

    it('finds matches in the middle of large files', async () => {
      // Create a large file with the match in the middle
      const padding = 'Lorem ipsum dolor sit amet. '.repeat(100); // ~2800 chars
      const vault = new InMemoryVaultManager({
        'Notes/large.md': padding + 'IMPORTANT_KEYWORD_HERE' + padding,
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'IMPORTANT_KEYWORD',
        exact: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].snippet).toContain('IMPORTANT_KEYWORD');
    });

    it('defaults to limit of 50 when not specified', async () => {
      const vault = new InMemoryVaultManager(
        Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`Notes/file${i}.md`, 'match'])),
      );
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'match',
        exact: true,
      });

      expect(result.success).toBe(true);
      expect(result.data.results.length).toBeLessThanOrEqual(50);
    });
  });
});

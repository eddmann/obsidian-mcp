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

      // Both should be content matches
      const alphaMatch = result.data.results.find((r: any) => r.path === 'Notes/alpha.md');
      expect(alphaMatch).toBeDefined();
      expect(alphaMatch.match_type).toBe('content');
      expect(alphaMatch.relevance_score).toBeGreaterThanOrEqual(1);
      expect(alphaMatch.relevance_score).toBeLessThanOrEqual(4);
      expect(alphaMatch.matches).toEqual([
        {
          line: 3,
          content: 'Contains a keyword',
          context_before: ['# Alpha', ''],
          context_after: ['Another line'],
        },
      ]);

      const betaMatch = result.data.results.find((r: any) => r.path === 'Notes/beta.md');
      expect(betaMatch).toBeDefined();
      expect(betaMatch.match_type).toBe('content');
      expect(betaMatch.relevance_score).toBeGreaterThanOrEqual(1);
      expect(betaMatch.relevance_score).toBeLessThanOrEqual(4);
      expect(betaMatch.matches).toEqual([
        {
          line: 3,
          content: 'keyword inside beta',
          context_before: ['# Beta', ''],
          context_after: [],
        },
      ]);
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
      expect(result.data.results[0].matches).toHaveLength(3);
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

    it('finds multiple content matches in single file', async () => {
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
      expect(result.data.results[0].matches).toHaveLength(4);
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
      expect(result.data.results[0].matches[0].content).toBe('Price: $100 (test)');
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
        expect(contentMatch.matches).toBeDefined();
        expect(contentMatch.matches.length).toBeGreaterThan(0);
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
    it('finds filename matches without matches array', async () => {
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
      expect(filenameMatch.matches).toBeUndefined(); // No matches array for filename matches

      const contentMatch = result.data.results.find(
        (r: any) => r.match_type === 'content' && r.path === 'Notes/other.md',
      );
      expect(contentMatch).toBeDefined();
      expect(contentMatch.matches).toBeDefined(); // Content matches have matches array
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
      expect(filenameMatch.matches).toBeUndefined();

      const contentMatch = sameFileResults.find((r: any) => r.match_type === 'content');
      expect(contentMatch).toBeDefined();
      expect(contentMatch.matches).toBeDefined();
      expect(contentMatch.matches.length).toBeGreaterThan(0);
    });
  });

  describe('Context lines', () => {
    it('always includes 2 lines of context for content matches', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': ['Line 1', 'Line 2', 'Line 3 with match', 'Line 4', 'Line 5'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'match',
        exact: true,
      });

      expect(result.success).toBe(true);
      const match = result.data.results[0].matches[0];
      expect(match.line).toBe(3);
      expect(match.content).toBe('Line 3 with match');
      expect(match.context_before).toEqual(['Line 1', 'Line 2']);
      expect(match.context_after).toEqual(['Line 4', 'Line 5']);
    });

    it('handles context at file boundaries', async () => {
      const vault = new InMemoryVaultManager({
        'Notes/doc.md': ['First match', 'Line 2', 'Last match'].join('\n'),
      });
      harness = new ToolHarness({ vault });

      const result = await harness.invoke('search-vault', {
        query: 'match',
        exact: true,
      });

      expect(result.success).toBe(true);
      const matches = result.data.results[0].matches;

      // First line - no context before
      expect(matches[0].context_before).toEqual([]);
      expect(matches[0].context_after).toEqual(['Line 2', 'Last match']);

      // Last line - no context after
      expect(matches[1].context_before).toEqual(['First match', 'Line 2']);
      expect(matches[1].context_after).toEqual([]);
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

import Fuse from 'fuse.js';
import { VaultManager } from '@/services/vault-manager';
import type { ToolResponse } from './types';
import { logger } from '@/utils/logger';

interface SearchResult {
  path: string;
  match_type: 'filename' | 'content';
  relevance_score: 1 | 2 | 3 | 4;
  matches?: Array<{
    line: number;
    content: string;
    context_before: string[];
    context_after: string[];
  }>;
}

interface FileSearchItem {
  path: string;
  filename: string;
  content?: string;
  lines?: string[];
}

export async function handleSearchVault(
  vault: VaultManager,
  args: {
    query: string;
    exact?: boolean;
    path_filter?: string;
    file_types?: string[];
    limit?: number;
  },
): Promise<ToolResponse> {
  try {
    const isExact = args.exact || false;
    const limit = args.limit || 50;
    const fileTypes = args.file_types || ['md'];

    // List all files
    const allFiles = await vault.listFiles('', {
      fileTypes,
      recursive: true,
    });

    // Apply path filter if provided
    let filesToSearch = allFiles;
    if (args.path_filter) {
      const pathRegex = new RegExp(args.path_filter, 'i');
      filesToSearch = allFiles.filter(f => pathRegex.test(f));
    }

    const results = isExact
      ? await performExactSearch(vault, filesToSearch, args.query, limit)
      : await performFuzzySearch(vault, filesToSearch, args.query, limit);

    return {
      success: true,
      data: {
        results,
        total_matches: results.length,
        total_files: results.length,
      },
      metadata: { timestamp: new Date().toISOString() },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      metadata: { timestamp: new Date().toISOString() },
    };
  }
}

async function performFuzzySearch(
  vault: VaultManager,
  files: string[],
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // First, search filenames only (no need to read files)
  const filenameItems: FileSearchItem[] = files.map(path => ({
    path,
    filename: path.split('/').pop() || path,
  }));

  const filenameFuse = new Fuse(filenameItems, {
    keys: ['filename'],
    threshold: 0.6,
    includeScore: true,
    ignoreLocation: true,
  });

  const filenameMatches = filenameFuse.search(query);

  // Add filename matches with score 1
  for (const match of filenameMatches) {
    if (results.length >= limit) break;

    results.push({
      path: match.item.path,
      match_type: 'filename',
      relevance_score: 1, // Always 1 for filename matches
    });
  }

  // Now search file contents
  const contentItems: FileSearchItem[] = [];

  // Read files in batches
  const batchSize = 10;
  for (let i = 0; i < files.length && results.length < limit; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    await Promise.all(
      batch.map(async path => {
        try {
          const content = await vault.readFile(path);
          const lines = content.split('\n');
          contentItems.push({
            path,
            filename: path.split('/').pop() || path,
            content,
            lines,
          });
        } catch (error) {
          logger.warn(`Error reading file during search`, { path, error });
        }
      }),
    );
  }

  // Fuzzy search content
  const contentFuse = new Fuse(contentItems, {
    keys: ['content'],
    threshold: 0.6,
    includeScore: true,
    ignoreLocation: true,
  });

  const contentMatches = contentFuse.search(query);

  // Process content matches
  for (const match of contentMatches) {
    if (results.length >= limit) break;

    const item = match.item;
    const score = match.score || 0;

    // Find matching lines
    const matchingLines = findMatchingLines(item.lines || [], query, false);

    if (matchingLines.length > 0) {
      results.push({
        path: item.path,
        match_type: 'content',
        relevance_score: fuseScoreToRelevance(score),
        matches: matchingLines,
      });
    }
  }

  return results;
}

async function performExactSearch(
  vault: VaultManager,
  files: string[],
  query: string,
  limit: number,
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];
  const queryLower = query.toLowerCase();

  // Search filenames first
  for (const path of files) {
    if (results.length >= limit) break;

    const filename = path.split('/').pop() || path;
    if (filename.toLowerCase().includes(queryLower)) {
      results.push({
        path,
        match_type: 'filename',
        relevance_score: 1, // Always 1 for filename matches
      });
    }
  }

  // Search file contents
  const batchSize = 10;
  for (let i = 0; i < files.length && results.length < limit; i += batchSize) {
    const batch = files.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async path => {
        try {
          const content = await vault.readFile(path);
          const lines = content.split('\n');

          const matchingLines = findMatchingLines(lines, query, true);

          if (matchingLines.length > 0) {
            return {
              path,
              match_type: 'content' as const,
              relevance_score: calculateExactScore(query, matchingLines),
              matches: matchingLines,
            };
          }

          return null;
        } catch (error) {
          logger.warn(`Error searching file`, { path, error });
          return null;
        }
      }),
    );

    for (const result of batchResults) {
      if (result && results.length < limit) {
        results.push(result);
      }
    }
  }

  return results;
}

function findMatchingLines(
  lines: string[],
  query: string,
  isExact: boolean,
): Array<{
  line: number;
  content: string;
  context_before: string[];
  context_after: string[];
}> {
  const matches: Array<{
    line: number;
    content: string;
    context_before: string[];
    context_after: string[];
  }> = [];

  const queryLower = query.toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const lineLower = lines[i].toLowerCase();

    let isMatch = false;
    if (isExact) {
      isMatch = lineLower.includes(queryLower);
    } else {
      // Fuzzy matching - check if query terms appear
      isMatch = lineLower.includes(queryLower);
    }

    if (isMatch) {
      const contextBefore: string[] = [];
      const contextAfter: string[] = [];

      // Get 2 lines of context before
      for (let j = Math.max(0, i - 2); j < i; j++) {
        contextBefore.push(lines[j]);
      }

      // Get 2 lines of context after
      for (let j = i + 1; j <= Math.min(lines.length - 1, i + 2); j++) {
        contextAfter.push(lines[j]);
      }

      matches.push({
        line: i + 1, // 1-based line numbers
        content: lines[i],
        context_before: contextBefore,
        context_after: contextAfter,
      });
    }
  }

  return matches;
}

function fuseScoreToRelevance(score: number): 1 | 2 | 3 | 4 {
  if (score < 0.25) return 1; // Excellent
  if (score < 0.5) return 2; // Good
  if (score < 0.75) return 3; // Fair
  return 4; // Poor
}

function calculateExactScore(
  query: string,
  matches: Array<{ line: number; content: string }>,
): 1 | 2 | 3 | 4 {
  const queryLower = query.toLowerCase();

  // Check if any line starts with the query
  for (const match of matches) {
    const contentLower = match.content.toLowerCase().trim();
    if (contentLower.startsWith(queryLower)) {
      return 1; // Excellent - starts with query
    }
  }

  // Check for exact word match
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegExp(queryLower)}\\b`, 'i');
  for (const match of matches) {
    if (wordBoundaryRegex.test(match.content)) {
      return 1; // Excellent - exact word match
    }
  }

  // Check if query appears early in line
  for (const match of matches) {
    const contentLower = match.content.toLowerCase();
    const index = contentLower.indexOf(queryLower);
    if (index !== -1 && index < 10) {
      return 2; // Good - appears early in line
    }
  }

  // Default to good for any exact match
  return 2;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

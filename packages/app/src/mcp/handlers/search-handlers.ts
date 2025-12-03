import Fuse, { FuseResultMatch } from 'fuse.js';
import { VaultManager } from '@/services/vault-manager';
import type { ToolResponse } from './types';
import { logger } from '@/utils/logger';

interface SearchResult {
  path: string;
  match_type: 'filename' | 'content';
  relevance_score: 1 | 2 | 3 | 4;
  snippet?: string;
}

interface FileSearchItem {
  path: string;
  filename: string;
  content?: string;
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
    // Validate query
    const query = args.query?.trim();
    if (!query) {
      return {
        success: false,
        error: 'Search query cannot be empty',
        metadata: { timestamp: new Date().toISOString() },
      };
    }

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
      try {
        const pathRegex = new RegExp(args.path_filter, 'i');
        filesToSearch = allFiles.filter(f => pathRegex.test(f));
      } catch {
        return {
          success: false,
          error: `Invalid path_filter regex: ${args.path_filter}`,
          metadata: { timestamp: new Date().toISOString() },
        };
      }
    }

    const results = isExact
      ? await performExactSearch(vault, filesToSearch, query, limit)
      : await performFuzzySearch(vault, filesToSearch, query, limit);

    // Sort by relevance (best matches first)
    results.sort((a, b) => a.relevance_score - b.relevance_score);

    // Calculate totals
    const uniqueFiles = new Set(results.map(r => r.path));

    return {
      success: true,
      data: {
        results,
        total_matches: results.length,
        total_files: uniqueFiles.size,
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
    threshold: 0.4,
    includeScore: true,
    ignoreLocation: true,
  });

  const filenameMatches = filenameFuse.search(query);

  // Add filename matches with quality filtering
  for (const match of filenameMatches) {
    if (results.length >= limit) break;

    const score = match.score || 0;

    // Filter out poor quality matches (score > 0.6)
    if (score > 0.6) continue;

    results.push({
      path: match.item.path,
      match_type: 'filename',
      relevance_score: fuseScoreToRelevance(score),
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
          contentItems.push({
            path,
            filename: path.split('/').pop() || path,
            content,
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
    threshold: 0.4,
    includeScore: true,
    includeMatches: true,
    ignoreLocation: true,
  });

  const contentMatches = contentFuse.search(query);

  // Process content matches
  for (const match of contentMatches) {
    if (results.length >= limit) break;

    const score = match.score || 0;

    // Filter out poor quality matches (same threshold as filename matches)
    if (score > 0.6) continue;

    const item = match.item;

    // Extract snippet from match indices
    const snippet = extractSnippet(item.content || '', match.matches);

    results.push({
      path: item.path,
      match_type: 'content',
      relevance_score: fuseScoreToRelevance(score),
      snippet,
    });
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
          const contentLower = content.toLowerCase();
          const index = contentLower.indexOf(queryLower);

          if (index !== -1) {
            return {
              path,
              match_type: 'content' as const,
              relevance_score: calculateExactScore(query, content, index),
              snippet: extractSnippetAtIndex(content, index, query.length),
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

function extractSnippet(
  content: string,
  matches: readonly FuseResultMatch[] | undefined,
  maxLength = 150,
): string {
  if (!matches || matches.length === 0 || !matches[0].indices?.length) {
    // Fallback: return start of content
    return content.slice(0, maxLength) + (content.length > maxLength ? '...' : '');
  }

  // Get first match range [start, end]
  const [start, end] = matches[0].indices[0];
  const matchLength = end - start + 1;
  return extractSnippetAtIndex(content, start, matchLength, maxLength);
}

function extractSnippetAtIndex(
  content: string,
  matchIndex: number,
  matchLength: number,
  maxLength = 150,
): string {
  // Calculate snippet window around match
  const padding = Math.floor((maxLength - matchLength) / 2);
  const snippetStart = Math.max(0, matchIndex - padding);
  const snippetEnd = Math.min(content.length, matchIndex + matchLength + padding);

  let snippet = content.slice(snippetStart, snippetEnd);

  // Clean up: trim to word boundaries and normalize whitespace
  snippet = snippet.replace(/\s+/g, ' ').trim();

  // Add ellipsis if truncated
  if (snippetStart > 0) snippet = '...' + snippet;
  if (snippetEnd < content.length) snippet = snippet + '...';

  return snippet;
}

function fuseScoreToRelevance(score: number): 1 | 2 | 3 | 4 {
  if (score < 0.25) return 1; // Excellent
  if (score < 0.5) return 2; // Good
  if (score < 0.75) return 3; // Fair
  return 4; // Poor
}

function calculateExactScore(query: string, content: string, index: number): 1 | 2 | 3 | 4 {
  const queryLower = query.toLowerCase();

  // Check for exact word boundary match
  const wordBoundaryRegex = new RegExp(`\\b${escapeRegExp(queryLower)}\\b`, 'i');
  if (wordBoundaryRegex.test(content)) {
    return 1; // Excellent - exact word match
  }

  // Check if appears early in content
  if (index < 50) {
    return 2; // Good - appears early
  }

  // Default for any match
  return 2;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

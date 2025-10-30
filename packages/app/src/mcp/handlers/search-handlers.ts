import { VaultManager } from '@/services/vault-manager';
import type { ToolResponse } from './types';

// ========== SEARCH ==========

export async function handleSearchVault(
  vault: VaultManager,
  args: {
    query: string;
    case_sensitive?: boolean;
    regex?: boolean;
    path_filter?: string;
    file_types?: string[];
    limit?: number;
    include_content?: boolean;
    context_lines?: number;
  },
): Promise<ToolResponse> {
  try {
    const caseSensitive = args.case_sensitive || false;
    const isRegex = args.regex || false;
    const limit = args.limit || 50;
    const includeContent = args.include_content !== false;
    const contextLines = args.context_lines || 2;

    const allFiles = await vault.listFiles('', {
      fileTypes: args.file_types || ['md'],
      recursive: true,
    });

    let filesToSearch = allFiles;
    if (args.path_filter) {
      const pathRegex = new RegExp(args.path_filter, caseSensitive ? '' : 'i');
      filesToSearch = allFiles.filter(f => pathRegex.test(f));
    }

    const searchPattern = isRegex ? args.query : escapeRegExp(args.query);
    const searchRegex = new RegExp(searchPattern, caseSensitive ? 'g' : 'gi');

    const results: any[] = [];
    let totalMatches = 0;
    const batchSize = 4;

    for (let i = 0; i < filesToSearch.length && results.length < limit; i += batchSize) {
      const batch = filesToSearch.slice(i, i + batchSize);

      const batchResults = await Promise.all(
        batch.map(async filePath => {
          try {
            const content = await vault.readFile(filePath);
            const lines = content.split('\n');
            const matches: any[] = [];

            for (let lineNum = 0; lineNum < lines.length; lineNum++) {
              searchRegex.lastIndex = 0;
              if (searchRegex.test(lines[lineNum])) {
                const match: any = {
                  line: lineNum + 1,
                };

                if (includeContent) {
                  match.content = lines[lineNum];

                  if (contextLines > 0) {
                    match.context_before = [];
                    match.context_after = [];

                    for (let j = 1; j <= contextLines; j++) {
                      if (lineNum - j >= 0) {
                        match.context_before.unshift(lines[lineNum - j]);
                      }
                      if (lineNum + j < lines.length) {
                        match.context_after.push(lines[lineNum + j]);
                      }
                    }
                  }
                }

                matches.push(match);
              }
            }

            if (matches.length > 0) {
              return { path: filePath, matches };
            }

            return null;
          } catch (error) {
            console.warn(`Error searching ${filePath}:`, error);
            return null;
          }
        }),
      );

      for (const result of batchResults) {
        if (result && results.length < limit) {
          results.push(result);
          totalMatches += result.matches.length;
        }
      }
    }

    return {
      success: true,
      data: {
        results,
        total_matches: totalMatches,
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

// ========== HELPER FUNCTIONS ==========

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

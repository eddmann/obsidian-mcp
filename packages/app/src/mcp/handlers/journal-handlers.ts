import { VaultManager } from '@/services/vault-manager';
import { formatJournalEntry } from '@/services/journal-formatter';
import type { ToolResponse, JournalConfig } from './types';
import { getOrInitializeContent } from './file-handlers';

// ========== JOURNAL LOGGING ==========

export async function handleLogJournalEntry(
  vault: VaultManager,
  args: {
    activity_type:
      | 'development'
      | 'research'
      | 'writing'
      | 'planning'
      | 'learning'
      | 'problem-solving';
    summary: string;
    key_topics: string[];
    outputs?: string[];
    project?: string;
  },
  config: JournalConfig,
): Promise<ToolResponse> {
  try {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const journalPath = config.journalPathTemplate.replace('{{date}}', dateStr);

    // Use helper function to get or initialize content
    let content = await getOrInitializeContent(vault, journalPath, config);

    const entry = formatJournalEntry({
      timestamp: now,
      activityType: args.activity_type,
      summary: args.summary,
      keyTopics: args.key_topics,
      outputs: args.outputs,
      project: args.project,
    });

    content = insertUnderSection(content, config.journalActivitySection, entry);

    await vault.writeFile(journalPath, content);

    return {
      success: true,
      data: {
        success: true,
        journal_path: journalPath,
        entry_timestamp: now.toISOString(),
      },
      metadata: {
        timestamp: now.toISOString(),
        affected_files: [journalPath],
      },
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

function insertUnderSection(content: string, sectionHeading: string, entry: string): string {
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === sectionHeading) {
      // Find the end of this section (before next heading of same or higher level)
      const sectionLevel = sectionHeading.match(/^#+/)?.[0].length || 2;
      let insertIndex = i + 1;

      // Skip to find the end of this section
      while (insertIndex < lines.length) {
        const line = lines[insertIndex].trim();
        // Check if this is a heading of same or higher level (fewer #'s)
        const headingMatch = line.match(/^(#+)\s/);
        if (headingMatch && headingMatch[1].length <= sectionLevel) {
          break; // Found next section, insert before it
        }
        insertIndex++;
      }

      // Insert before the next section (or at end)
      lines.splice(insertIndex, 0, entry);
      return lines.join('\n');
    }
  }

  return content + '\n\n' + sectionHeading + '\n' + entry;
}

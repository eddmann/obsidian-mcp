import { describe, it, expect } from 'vitest';
import { formatJournalEntry } from '@/services/journal-formatter';

describe('formatJournalEntry', () => {
  it('formats the entry with headings, tags, and optional fields', () => {
    const timestamp = new Date('2024-03-20T18:30:00Z');

    const output = formatJournalEntry({
      timestamp,
      activityType: 'development',
      summary: 'Shipped the new search feature.',
      keyTopics: ['TypeScript', 'Vitest'],
      outputs: ['tests/behavior/files.spec.ts'],
      project: 'Projects/Testing Strategy',
    });

    expect(output).toContain('### 6:30 PM - Development');
    expect(output).toContain('**Topics:** #typescript #vitest');
    expect(output).toContain('**Outputs:** tests/behavior/files.spec.ts');
    expect(output).toContain('**Project:** [[Projects/Testing Strategy]]');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  vi.useRealTimers();
  harness?.dispose();
});

describe('Journal logging behaviour', () => {
  it("logs today's work into the journal and creates the file when missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T09:45:00Z'));

    harness = new ToolHarness();

    const result = await harness.invoke('log-journal-entry', {
      activity_type: 'development',
      summary: 'Implemented behaviour-driven tests.',
      key_topics: ['Vitest', 'Doubles'],
      outputs: ['tests/behavior/files.spec.ts'],
      project: 'Projects/Testing Strategy',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      success: true,
      journal_path: 'Journal/2024-06-15.md',
      entry_timestamp: new Date('2024-06-15T09:45:00.000Z').toISOString(),
    });

    const content = await harness.vault.readFile('Journal/2024-06-15.md');
    expect(content).toContain('date: 2024-06-15');
    expect(content).toContain('## Journal');
    expect(content).toContain('### 9:45 AM - Development');
    expect(content).toContain('**Topics:** #vitest #doubles');
    expect(content).toContain('**Outputs:** tests/behavior/files.spec.ts');
    expect(content).toContain('**Project:** [[Projects/Testing Strategy]]');
  });

  it('appends a new entry under the configured section when the journal already exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-16T14:10:00Z'));

    const existing = [
      '---',
      'date: 2024-06-16',
      'tags: [journal]',
      '---',
      '',
      '# June 16, 2024',
      '',
      '## Journal',
      '### 9:00 AM - Planning',
      'Initial planning notes',
      '',
      '## Evening Reflection',
      '',
    ].join('\n');

    harness = new ToolHarness({
      vault: new InMemoryVaultManager({ 'Journal/2024-06-16.md': existing }),
    });

    const result = await harness.invoke('log-journal-entry', {
      activity_type: 'research',
      summary: 'Reviewed user interviews.',
      key_topics: ['UX', 'Feedback'],
    });

    expect(result.success).toBe(true);
    const updated = await harness.vault.readFile('Journal/2024-06-16.md');
    expect(updated).toContain('### 2:10 PM - Research');
    expect(updated).toMatch(/## Journal\n### 9:00 AM - Planning[\s\S]*### 2:10 PM - Research/);
  });

  it('logs entry with all optional fields (outputs and project)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-01T10:30:00Z'));

    harness = new ToolHarness();

    const result = await harness.invoke('log-journal-entry', {
      activity_type: 'development',
      summary: 'Built new feature.',
      key_topics: ['TypeScript', 'Testing'],
      outputs: ['feature.ts', 'feature.spec.ts'],
      project: 'Projects/MCP Server',
    });

    expect(result.success).toBe(true);
    const content = await harness.vault.readFile('Journal/2024-07-01.md');
    expect(content).toContain('**Outputs:** feature.ts, feature.spec.ts');
    expect(content).toContain('**Project:** [[Projects/MCP Server]]');
  });

  it('logs different activity types correctly', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-08-15T13:00:00Z'));

    harness = new ToolHarness();

    const activityTypes = ['writing', 'planning', 'learning', 'problem-solving'] as const;

    for (const activityType of activityTypes) {
      const result = await harness.invoke('log-journal-entry', {
        activity_type: activityType,
        summary: `Testing ${activityType}`,
        key_topics: ['test'],
      });

      expect(result.success).toBe(true);
    }

    const content = await harness.vault.readFile('Journal/2024-08-15.md');
    expect(content).toContain('Writing');
    expect(content).toContain('Planning');
    expect(content).toContain('Learning');
    expect(content).toContain('Problem-solving');
  });

  it('formats timestamps correctly in AM', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-09-10T08:15:00Z'));

    harness = new ToolHarness();

    const result = await harness.invoke('log-journal-entry', {
      activity_type: 'planning',
      summary: 'Morning planning session.',
      key_topics: ['Goals'],
    });

    expect(result.success).toBe(true);
    const content = await harness.vault.readFile('Journal/2024-09-10.md');
    expect(content).toContain('8:15 AM');
  });

  it('formats timestamps correctly in PM', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-09-10T20:45:00Z'));

    harness = new ToolHarness();

    const result = await harness.invoke('log-journal-entry', {
      activity_type: 'writing',
      summary: 'Evening writing.',
      key_topics: ['Documentation'],
    });

    expect(result.success).toBe(true);
    const content = await harness.vault.readFile('Journal/2024-09-10.md');
    expect(content).toContain('8:45 PM');
  });

  it('handles special characters in summary and topics', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-10-05T12:00:00Z'));

    harness = new ToolHarness();

    const result = await harness.invoke('log-journal-entry', {
      activity_type: 'development',
      summary: 'Fixed bug with "quotes" & special chars.',
      key_topics: ['C++', 'Debugging & Testing'],
    });

    expect(result.success).toBe(true);
    const content = await harness.vault.readFile('Journal/2024-10-05.md');
    expect(content).toContain('Fixed bug with "quotes" & special chars.');
    expect(content).toContain('#c');
    expect(content).toContain('#debugging');
  });

  it('creates journal parent directory if it does not exist', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-11-20T15:00:00Z'));

    harness = new ToolHarness();

    const result = await harness.invoke('log-journal-entry', {
      activity_type: 'research',
      summary: 'Initial research.',
      key_topics: ['Topic'],
    });

    expect(result.success).toBe(true);
    expect(result.data.journal_path).toBe('Journal/2024-11-20.md');
    expect(await harness.vault.fileExists('Journal/2024-11-20.md')).toBe(true);
  });

  it('fails gracefully when template file does not exist', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-12-01T10:00:00Z'));

    // Create vault without the template file
    const vault = new InMemoryVaultManager({});
    harness = new ToolHarness({
      vault,
      env: {
        JOURNAL_FILE_TEMPLATE: 'Templates/NonExistent.md',
      },
    });

    const result = await harness.invoke('log-journal-entry', {
      activity_type: 'development',
      summary: 'Test entry.',
      key_topics: ['Testing'],
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('Templates/NonExistent.md');
    expect(result.text).toContain('not found');
  });

  it('initializes daily note from template when using patch-content on non-existent file', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-20T10:00:00Z'));

    harness = new ToolHarness();

    const result = await harness.invoke('patch-content', {
      path: 'Journal/2024-06-20.md',
      content: 'New section content',
      anchor_type: 'heading',
      anchor_value: 'Journal',
      position: 'after',
      create_if_missing: true,
    });

    expect(result.success).toBe(true);
    const content = await harness.vault.readFile('Journal/2024-06-20.md');

    // Should have template content
    expect(content).toContain('date: 2024-06-20');
    expect(content).toContain('## Journal');

    // Should have the patched content
    expect(content).toContain('New section content');
  });

  it('initializes daily note from template when using append-content on non-existent file', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-07-15T14:30:00Z'));

    harness = new ToolHarness();

    const result = await harness.invoke('append-content', {
      path: 'Journal/2024-07-15.md',
      content: 'Appended note content',
      create_if_missing: true,
    });

    expect(result.success).toBe(true);
    const content = await harness.vault.readFile('Journal/2024-07-15.md');

    // Should have template content
    expect(content).toContain('date: 2024-07-15');
    expect(content).toContain('## Journal');

    // Should have the appended content
    expect(content).toContain('Appended note content');
  });

  it('does not use template for non-journal files with patch-content', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('patch-content', {
      path: 'Notes/SomeNote.md',
      content: 'Test content',
      anchor_type: 'frontmatter',
      anchor_value: 'title',
      position: 'replace',
      create_if_missing: true,
    });

    expect(result.success).toBe(true);
    const content = await harness.vault.readFile('Notes/SomeNote.md');

    // Should NOT have journal template content
    expect(content).not.toContain('## Journal');
    expect(content).not.toContain('## Activity Log');

    // Should have the frontmatter we added
    expect(content).toContain('title: Test content');
  });

  it('does not use template for non-journal files with append-content', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('append-content', {
      path: 'Notes/AnotherNote.md',
      content: 'Appended content',
      create_if_missing: true,
    });

    expect(result.success).toBe(true);
    const content = await harness.vault.readFile('Notes/AnotherNote.md');

    // Should NOT have template content
    expect(content).not.toContain('date:');
    expect(content).not.toContain('## Journal');

    // Should only have the appended content
    expect(content).toBe('Appended content');
  });
});

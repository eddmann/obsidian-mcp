import { afterEach, describe, expect, it } from 'vitest';
import { ToolHarness } from '@tests/support/harness/tool-harness.js';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

let harness: ToolHarness;

afterEach(() => {
  harness?.dispose();
});

describe('File tool behaviours', () => {
  it('creates a note and writes content', async () => {
    harness = new ToolHarness();

    const { success, data } = await harness.invoke('create-note', {
      path: 'Inbox/new-note.md',
      content: '# Hello\n',
    });

    expect(success).toBe(true);
    expect(data).toEqual({ success: true, path: 'Inbox/new-note.md' });
    expect(await harness.vault.readFile('Inbox/new-note.md')).toBe('# Hello\n');
  });

  it('reads an existing note and returns its content', async () => {
    const vault = new InMemoryVaultManager({ 'Notes/daily.md': '# Daily note' });
    harness = new ToolHarness({ vault });

    const { success, data } = await harness.invoke('read-note', {
      path: 'Notes/daily.md',
    });

    expect(success).toBe(true);
    expect(data).toEqual({ content: '# Daily note', path: 'Notes/daily.md' });
  });

  it('edits a note and replaces its contents', async () => {
    const vault = new InMemoryVaultManager({ 'Doc.md': 'Old content' });
    harness = new ToolHarness({ vault });

    const { success } = await harness.invoke('edit-note', {
      path: 'Doc.md',
      content: 'New content',
    });

    expect(success).toBe(true);
    expect(await harness.vault.readFile('Doc.md')).toBe('New content');
  });

  it('appends to an existing note, inserting a newline when needed', async () => {
    const vault = new InMemoryVaultManager({ 'Doc.md': 'Line one' });
    harness = new ToolHarness({ vault });

    const { success } = await harness.invoke('append-content', {
      path: 'Doc.md',
      content: 'Appended line',
    });

    expect(success).toBe(true);
    expect(await harness.vault.readFile('Doc.md')).toBe('Line one\nAppended line');
  });

  it('requires confirm=true to delete a note', async () => {
    const vault = new InMemoryVaultManager({ 'Doc.md': 'Content' });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('delete-note', {
      path: 'Doc.md',
      confirm: false,
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('Must set confirm=true');
    expect(await harness.vault.readFile('Doc.md')).toBe('Content');
  });

  it('deletes a note when confirmed', async () => {
    const vault = new InMemoryVaultManager({ 'Trash.md': 'Soon gone' });
    harness = new ToolHarness({ vault });

    const { success } = await harness.invoke('delete-note', {
      path: 'Trash.md',
      confirm: true,
    });

    expect(success).toBe(true);
    await expect(harness.vault.fileExists('Trash.md')).resolves.toBe(false);
  });

  it('fails to create a note when the file already exists without overwrite', async () => {
    const vault = new InMemoryVaultManager({ 'Inbox/duplicate.md': 'Existing' });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('create-note', {
      path: 'Inbox/duplicate.md',
      content: 'New content',
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('already exists');
    expect(await harness.vault.readFile('Inbox/duplicate.md')).toBe('Existing');
  });

  it('moves a note and overwrites the destination when requested', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/source.md': 'Source body',
      'Notes/destination.md': 'Old body',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('move-note', {
      source_path: 'Notes/source.md',
      destination_path: 'Notes/destination.md',
      overwrite: true,
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.fileExists('Notes/source.md')).toBe(false);
    expect(await harness.vault.readFile('Notes/destination.md')).toBe('Source body');
  });

  it('prevents appending when the target file is missing and creation is disabled', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('append-content', {
      path: 'Missing.md',
      content: 'Should not be written',
      create_if_missing: false,
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('does not exist');
    expect(await harness.vault.fileExists('Missing.md')).toBe(false);
  });

  it('creates a note with overwrite=true when file already exists', async () => {
    const vault = new InMemoryVaultManager({ 'Existing.md': 'Old content' });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('create-note', {
      path: 'Existing.md',
      content: 'New content',
      overwrite: true,
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Existing.md')).toBe('New content');
  });

  it('fails to read a non-existent note', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('read-note', {
      path: 'NonExistent.md',
    });

    expect(result.success).toBe(false);
    expect(result.text).toBeDefined();
  });

  it('creates file when editing a non-existent note', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('edit-note', {
      path: 'NonExistent.md',
      content: 'New content',
    });

    // edit-note creates the file if it doesn't exist
    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('NonExistent.md')).toBe('New content');
  });

  it('fails to move when destination exists without overwrite flag', async () => {
    const vault = new InMemoryVaultManager({
      'Source.md': 'Source content',
      'Dest.md': 'Dest content',
    });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('move-note', {
      source_path: 'Source.md',
      destination_path: 'Dest.md',
      overwrite: false,
    });

    expect(result.success).toBe(false);
    expect(result.text).toContain('already exists');
    expect(await harness.vault.readFile('Source.md')).toBe('Source content');
    expect(await harness.vault.readFile('Dest.md')).toBe('Dest content');
  });

  it('fails to move when source does not exist', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('move-note', {
      source_path: 'NonExistent.md',
      destination_path: 'Dest.md',
    });

    expect(result.success).toBe(false);
    expect(result.text).toBeDefined();
  });

  it('creates file when appending to missing file with default create_if_missing', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('append-content', {
      path: 'NewFile.md',
      content: 'First line',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('NewFile.md')).toBe('First line');
  });

  it('appends content without newline when newline=false', async () => {
    const vault = new InMemoryVaultManager({ 'Doc.md': 'Line one' });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('append-content', {
      path: 'Doc.md',
      content: ' continued',
      newline: false,
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Doc.md')).toBe('Line one continued');
  });

  it('appends to empty file without extra newlines', async () => {
    const vault = new InMemoryVaultManager({ 'Empty.md': '' });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('append-content', {
      path: 'Empty.md',
      content: 'First content',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Empty.md')).toBe('First content');
  });

  it('reads an empty file successfully', async () => {
    const vault = new InMemoryVaultManager({ 'Empty.md': '' });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('read-note', {
      path: 'Empty.md',
    });

    expect(result.success).toBe(true);
    expect(result.data.content).toBe('');
  });

  it('edits a file to empty content', async () => {
    const vault = new InMemoryVaultManager({ 'Doc.md': 'Some content' });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('edit-note', {
      path: 'Doc.md',
      content: '',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('Doc.md')).toBe('');
  });

  it('fails to delete a non-existent file', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('delete-note', {
      path: 'NonExistent.md',
      confirm: true,
    });

    expect(result.success).toBe(false);
    expect(result.text).toBeDefined();
  });

  it('moves note to a path with nested directories', async () => {
    const vault = new InMemoryVaultManager({ 'Source.md': 'Content' });
    harness = new ToolHarness({ vault });

    const result = await harness.invoke('move-note', {
      source_path: 'Source.md',
      destination_path: 'Deep/Nested/Path/File.md',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.fileExists('Source.md')).toBe(false);
    expect(await harness.vault.readFile('Deep/Nested/Path/File.md')).toBe('Content');
  });

  it('handles file paths with spaces', async () => {
    harness = new ToolHarness();

    const result = await harness.invoke('create-note', {
      path: 'My Notes/File with spaces.md',
      content: 'Content',
    });

    expect(result.success).toBe(true);
    expect(await harness.vault.readFile('My Notes/File with spaces.md')).toBe('Content');
  });
});

describe('Bulk read-notes tool behaviours', () => {
  it('reads multiple notes successfully', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/first.md': '# First note',
      'Notes/second.md': '# Second note',
      'Notes/third.md': '# Third note',
    });
    harness = new ToolHarness({ vault });

    const { success, data } = await harness.invoke('read-notes', {
      paths: ['Notes/first.md', 'Notes/second.md', 'Notes/third.md'],
    });

    expect(success).toBe(true);
    expect(data.total_requested).toBe(3);
    expect(data.total_success).toBe(3);
    expect(data.total_failed).toBe(0);
    expect(data.notes).toHaveLength(3);
    expect(data.notes[0]).toEqual({
      path: 'Notes/first.md',
      content: '# First note',
      success: true,
    });
    expect(data.notes[1]).toEqual({
      path: 'Notes/second.md',
      content: '# Second note',
      success: true,
    });
    expect(data.notes[2]).toEqual({
      path: 'Notes/third.md',
      content: '# Third note',
      success: true,
    });
  });

  it('handles partial success when some files are missing', async () => {
    const vault = new InMemoryVaultManager({
      'Notes/exists.md': 'Existing content',
    });
    harness = new ToolHarness({ vault });

    const { success, data } = await harness.invoke('read-notes', {
      paths: ['Notes/exists.md', 'Notes/missing.md', 'Notes/also-missing.md'],
    });

    expect(success).toBe(true);
    expect(data.total_requested).toBe(3);
    expect(data.total_success).toBe(1);
    expect(data.total_failed).toBe(2);
    expect(data.notes[0]).toEqual({
      path: 'Notes/exists.md',
      content: 'Existing content',
      success: true,
    });
    expect(data.notes[1].success).toBe(false);
    expect(data.notes[1].error).toBeDefined();
    expect(data.notes[2].success).toBe(false);
    expect(data.notes[2].error).toBeDefined();
  });

  it('reads single note via bulk operation', async () => {
    const vault = new InMemoryVaultManager({ 'Note.md': 'Solo content' });
    harness = new ToolHarness({ vault });

    const { success, data } = await harness.invoke('read-notes', {
      paths: ['Note.md'],
    });

    expect(success).toBe(true);
    expect(data.total_requested).toBe(1);
    expect(data.total_success).toBe(1);
    expect(data.total_failed).toBe(0);
    expect(data.notes[0]).toEqual({
      path: 'Note.md',
      content: 'Solo content',
      success: true,
    });
  });

  it('handles empty files in bulk read', async () => {
    const vault = new InMemoryVaultManager({
      'Empty.md': '',
      'NotEmpty.md': 'Content',
    });
    harness = new ToolHarness({ vault });

    const { success, data } = await harness.invoke('read-notes', {
      paths: ['Empty.md', 'NotEmpty.md'],
    });

    expect(success).toBe(true);
    expect(data.total_success).toBe(2);
    expect(data.notes[0]).toEqual({
      path: 'Empty.md',
      content: '',
      success: true,
    });
    expect(data.notes[1]).toEqual({
      path: 'NotEmpty.md',
      content: 'Content',
      success: true,
    });
  });

  it('reads many notes efficiently', async () => {
    const files = Array.from({ length: 20 }, (_, i) => ({
      path: `Notes/note-${i}.md`,
      content: `Content ${i}`,
    }));
    const vault = new InMemoryVaultManager(Object.fromEntries(files.map(f => [f.path, f.content])));
    harness = new ToolHarness({ vault });

    const { success, data } = await harness.invoke('read-notes', {
      paths: files.map(f => f.path),
    });

    expect(success).toBe(true);
    expect(data.total_requested).toBe(20);
    expect(data.total_success).toBe(20);
    expect(data.total_failed).toBe(0);
    expect(data.notes).toHaveLength(20);
    data.notes.forEach((note, i) => {
      expect(note.path).toBe(`Notes/note-${i}.md`);
      expect(note.content).toBe(`Content ${i}`);
      expect(note.success).toBe(true);
    });
  });

  it('handles all missing files gracefully', async () => {
    harness = new ToolHarness();

    const { success, data } = await harness.invoke('read-notes', {
      paths: ['Missing1.md', 'Missing2.md'],
    });

    expect(success).toBe(true);
    expect(data.total_requested).toBe(2);
    expect(data.total_success).toBe(0);
    expect(data.total_failed).toBe(2);
    expect(data.notes.every(n => !n.success)).toBe(true);
  });

  it('preserves order of requested paths', async () => {
    const vault = new InMemoryVaultManager({
      'A.md': 'Content A',
      'B.md': 'Content B',
      'C.md': 'Content C',
    });
    harness = new ToolHarness({ vault });

    const { success, data } = await harness.invoke('read-notes', {
      paths: ['C.md', 'A.md', 'B.md'],
    });

    expect(success).toBe(true);
    expect(data.notes[0].path).toBe('C.md');
    expect(data.notes[1].path).toBe('A.md');
    expect(data.notes[2].path).toBe('B.md');
  });

  it('handles duplicate paths in request', async () => {
    const vault = new InMemoryVaultManager({ 'Note.md': 'Content' });
    harness = new ToolHarness({ vault });

    const { success, data } = await harness.invoke('read-notes', {
      paths: ['Note.md', 'Note.md', 'Note.md'],
    });

    expect(success).toBe(true);
    expect(data.total_requested).toBe(3);
    expect(data.total_success).toBe(3);
    expect(data.notes).toHaveLength(3);
    data.notes.forEach(note => {
      expect(note.path).toBe('Note.md');
      expect(note.content).toBe('Content');
      expect(note.success).toBe(true);
    });
  });
});

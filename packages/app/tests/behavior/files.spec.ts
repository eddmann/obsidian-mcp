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

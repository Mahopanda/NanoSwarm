import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ToolContext } from '../../src/tools/base.ts';
import {
  createReadFileTool,
  createWriteFileTool,
  createEditFileTool,
  createListDirTool,
} from '../../src/tools/filesystem.ts';

let tempDir: string;
let context: ToolContext;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'nanoswarm-test-'));
  context = { workspace: tempDir, contextId: 'test' };
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe('read_file', () => {
  const tool = createReadFileTool();

  it('should read an existing file', async () => {
    await Bun.write(join(tempDir, 'hello.txt'), 'Hello, world!');
    const result = await tool.execute({ path: 'hello.txt' }, context);
    expect(result).toBe('Hello, world!');
  });

  it('should return error for missing file', async () => {
    const result = await tool.execute({ path: 'nonexistent.txt' }, context);
    expect(result).toContain('Error: File not found');
  });

  it('should resolve absolute paths', async () => {
    const absPath = join(tempDir, 'abs.txt');
    await Bun.write(absPath, 'absolute');
    const result = await tool.execute({ path: absPath }, context);
    expect(result).toBe('absolute');
  });
});

describe('write_file', () => {
  const tool = createWriteFileTool();

  it('should write a file', async () => {
    const result = await tool.execute({ path: 'out.txt', content: 'written' }, context);
    expect(result).toContain('Successfully wrote');
    const content = await Bun.file(join(tempDir, 'out.txt')).text();
    expect(content).toBe('written');
  });

  it('should create parent directories', async () => {
    await tool.execute({ path: 'a/b/c.txt', content: 'nested' }, context);
    const content = await Bun.file(join(tempDir, 'a/b/c.txt')).text();
    expect(content).toBe('nested');
  });
});

describe('edit_file', () => {
  const tool = createEditFileTool();

  it('should replace text in a file', async () => {
    await Bun.write(join(tempDir, 'edit.txt'), 'Hello World');
    const result = await tool.execute(
      { path: 'edit.txt', old_text: 'World', new_text: 'NanoSwarm' },
      context,
    );
    expect(result).toContain('Successfully edited');
    const content = await Bun.file(join(tempDir, 'edit.txt')).text();
    expect(content).toBe('Hello NanoSwarm');
  });

  it('should error when old_text not found', async () => {
    await Bun.write(join(tempDir, 'edit2.txt'), 'Hello World');
    const result = await tool.execute(
      { path: 'edit2.txt', old_text: 'xyz', new_text: 'abc' },
      context,
    );
    expect(result).toContain('Error: old_text not found');
    expect(result).toContain('Most similar snippet');
  });

  it('should error when old_text appears multiple times', async () => {
    await Bun.write(join(tempDir, 'dup.txt'), 'aaa bbb aaa');
    const result = await tool.execute(
      { path: 'dup.txt', old_text: 'aaa', new_text: 'ccc' },
      context,
    );
    expect(result).toContain('appears 2 times');
  });

  it('should error for missing file', async () => {
    const result = await tool.execute(
      { path: 'no.txt', old_text: 'a', new_text: 'b' },
      context,
    );
    expect(result).toContain('Error: File not found');
  });
});

describe('list_dir', () => {
  const tool = createListDirTool();

  it('should list directory contents', async () => {
    await Bun.write(join(tempDir, 'file1.txt'), '');
    await Bun.write(join(tempDir, 'file2.txt'), '');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(tempDir, 'subdir'));

    const result = await tool.execute({ path: '.' }, context);
    expect(result).toContain('[file]  file1.txt');
    expect(result).toContain('[file]  file2.txt');
    expect(result).toContain('[dir]  subdir');
  });

  it('should sort entries alphabetically', async () => {
    await Bun.write(join(tempDir, 'b.txt'), '');
    await Bun.write(join(tempDir, 'a.txt'), '');
    const result = await tool.execute({ path: '.' }, context);
    const lines = result.split('\n');
    expect(lines[0]).toContain('a.txt');
    expect(lines[1]).toContain('b.txt');
  });
});

describe('path restriction', () => {
  it('should block paths outside allowedDir', async () => {
    const restrictedContext: ToolContext = {
      workspace: tempDir,
      contextId: 'test',
      allowedDir: tempDir,
    };
    const tool = createReadFileTool();
    try {
      await tool.execute({ path: '/etc/passwd' }, restrictedContext);
      expect(true).toBe(false); // Should not reach here
    } catch (err: any) {
      expect(err.message).toContain('outside allowed directory');
    }
  });
});

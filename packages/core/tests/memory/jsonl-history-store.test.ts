import { describe, it, expect, beforeEach } from 'bun:test';
import { mkdtemp, mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonlHistoryStore } from '../../src/memory/jsonl-history-store.ts';

describe('JsonlHistoryStore', () => {
  let tempDir: string;
  let store: JsonlHistoryStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nanoswarm-jsonl-'));
    store = new JsonlHistoryStore(tempDir);
  });

  it('should return empty array for non-existent history', async () => {
    const result = await store.getHistory('no-such-context');
    expect(result).toEqual([]);
  });

  it('should append and retrieve history entries', async () => {
    await store.append('ctx1', 'Hello', 'Hi there!');
    await store.append('ctx1', 'How are you?', 'I am fine.');

    const entries = await store.getHistory('ctx1');
    expect(entries).toHaveLength(2);
    expect(entries[0].userMessage).toBe('Hello');
    expect(entries[0].agentResponse).toBe('Hi there!');
    expect(entries[1].userMessage).toBe('How are you?');
    expect(entries[1].agentResponse).toBe('I am fine.');
  });

  it('should return entries with valid timestamps', async () => {
    await store.append('ctx1', 'test', 'response');
    const entries = await store.getHistory('ctx1');
    expect(entries[0].timestamp).toBeInstanceOf(Date);
    expect(entries[0].timestamp.getTime()).not.toBeNaN();
  });

  it('should limit returned entries from the end', async () => {
    await store.append('ctx1', 'msg1', 'res1');
    await store.append('ctx1', 'msg2', 'res2');
    await store.append('ctx1', 'msg3', 'res3');

    const entries = await store.getHistory('ctx1', 2);
    expect(entries).toHaveLength(2);
    expect(entries[0].userMessage).toBe('msg2');
    expect(entries[1].userMessage).toBe('msg3');
  });

  it('should isolate history by contextId', async () => {
    await store.append('ctx-a', 'a-msg', 'a-res');
    await store.append('ctx-b', 'b-msg', 'b-res');

    const a = await store.getHistory('ctx-a');
    const b = await store.getHistory('ctx-b');
    expect(a).toHaveLength(1);
    expect(a[0].userMessage).toBe('a-msg');
    expect(b).toHaveLength(1);
    expect(b[0].userMessage).toBe('b-msg');
  });

  describe('search', () => {
    it('should find matching entries by substring', async () => {
      await store.append('ctx1', 'Tell me about TypeScript', 'TypeScript is great');
      await store.append('ctx1', 'Tell me about Python', 'Python is versatile');

      const results = await store.search('ctx1', 'TypeScript');
      expect(results).toHaveLength(1);
      expect(results[0].userMessage).toBe('Tell me about TypeScript');
    });

    it('should return empty array for no match', async () => {
      await store.append('ctx1', 'Hello', 'World');
      const results = await store.search('ctx1', 'Rust');
      expect(results).toEqual([]);
    });

    it('should be case-insensitive', async () => {
      await store.append('ctx1', 'typescript rocks', 'Indeed');
      const results = await store.search('ctx1', 'TypeScript');
      expect(results).toHaveLength(1);
    });
  });

  describe('pipe and newline safety', () => {
    it('should handle pipe character in messages without breaking', async () => {
      await store.append('ctx1', 'a | b | c', 'result | with | pipes');
      const entries = await store.getHistory('ctx1');
      expect(entries).toHaveLength(1);
      expect(entries[0].userMessage).toBe('a | b | c');
      expect(entries[0].agentResponse).toBe('result | with | pipes');
    });

    it('should handle newlines in messages via JSON escaping', async () => {
      await store.append('ctx1', 'line1\nline2\nline3', 'response\nwith\nnewlines');
      const entries = await store.getHistory('ctx1');
      expect(entries).toHaveLength(1);
      expect(entries[0].userMessage).toBe('line1\nline2\nline3');
      expect(entries[0].agentResponse).toBe('response\nwith\nnewlines');
    });
  });

  describe('tail-read with large datasets', () => {
    it('should correctly tail-read last N entries from 100+ entries', async () => {
      for (let i = 0; i < 120; i++) {
        await store.append('ctx1', `msg-${i}`, `res-${i}`);
      }
      const entries = await store.getHistory('ctx1', 5);
      expect(entries).toHaveLength(5);
      expect(entries[0].userMessage).toBe('msg-115');
      expect(entries[4].userMessage).toBe('msg-119');
    });
  });

  describe('legacy HISTORY.md fallback', () => {
    it('should read from legacy file when JSONL does not exist', async () => {
      const ctxDir = join(tempDir, '.nanoswarm', 'memory', 'legacy-ctx');
      await mkdir(ctxDir, { recursive: true });
      await writeFile(
        join(ctxDir, 'HISTORY.md'),
        '[2026-01-15 10:30] User: old msg | Agent: old response\n',
        'utf-8',
      );

      const entries = await store.getHistory('legacy-ctx');
      expect(entries).toHaveLength(1);
      expect(entries[0].userMessage).toBe('old msg');
      expect(entries[0].agentResponse).toBe('old response');
    });

    it('should limit legacy entries', async () => {
      const ctxDir = join(tempDir, '.nanoswarm', 'memory', 'legacy-ctx');
      await mkdir(ctxDir, { recursive: true });
      const lines = [
        '[2026-01-15 10:30] User: msg1 | Agent: res1',
        '[2026-01-15 10:31] User: msg2 | Agent: res2',
        '[2026-01-15 10:32] User: msg3 | Agent: res3',
      ].join('\n') + '\n';
      await writeFile(join(ctxDir, 'HISTORY.md'), lines, 'utf-8');

      const entries = await store.getHistory('legacy-ctx', 2);
      expect(entries).toHaveLength(2);
      expect(entries[0].userMessage).toBe('msg2');
    });
  });

  describe('lazy migration', () => {
    it('should migrate legacy HISTORY.md to JSONL on first append', async () => {
      const ctxDir = join(tempDir, '.nanoswarm', 'memory', 'mig-ctx');
      await mkdir(ctxDir, { recursive: true });
      await writeFile(
        join(ctxDir, 'HISTORY.md'),
        '[2026-01-15 10:30] User: old msg | Agent: old response\n',
        'utf-8',
      );

      // Append triggers migration
      await store.append('mig-ctx', 'new msg', 'new response');

      const entries = await store.getHistory('mig-ctx');
      expect(entries).toHaveLength(2);
      expect(entries[0].userMessage).toBe('old msg');
      expect(entries[1].userMessage).toBe('new msg');
    });
  });

  describe('archive', () => {
    it('should rename active file to timestamped archive', async () => {
      await store.append('ctx1', 'msg1', 'res1');
      await store.archive('ctx1');

      const ctxDir = join(tempDir, '.nanoswarm', 'memory', 'ctx1');
      const files = await readdir(ctxDir);
      const archives = files.filter((f) => f.startsWith('history.') && f !== 'history.jsonl');
      expect(archives).toHaveLength(1);
      expect(archives[0]).toMatch(/^history\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);

      // Active file should no longer exist — getHistory returns empty for active
      const entries = await store.getHistory('ctx1');
      expect(entries).toEqual([]);
    });

    it('should not throw if active file does not exist', async () => {
      await expect(store.archive('no-such')).resolves.toBeUndefined();
    });
  });

  describe('search across archives', () => {
    it('should search active file and archives', async () => {
      await store.append('ctx1', 'TypeScript question', 'TS answer');
      await store.archive('ctx1');
      await store.append('ctx1', 'Python question', 'Py answer');

      const tsResults = await store.search('ctx1', 'TypeScript');
      expect(tsResults).toHaveLength(1);
      expect(tsResults[0].userMessage).toBe('TypeScript question');

      const pyResults = await store.search('ctx1', 'Python');
      expect(pyResults).toHaveLength(1);
      expect(pyResults[0].userMessage).toBe('Python question');
    });
  });
});

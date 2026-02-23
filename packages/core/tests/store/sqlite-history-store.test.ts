import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initSchema } from '../../src/store/schema.ts';
import { SQLiteHistoryStore } from '../../src/store/sqlite-history-store.ts';

describe('SQLiteHistoryStore', () => {
  let db: Database;
  let store: SQLiteHistoryStore;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    store = new SQLiteHistoryStore(db);
  });

  afterEach(() => {
    db.close();
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
    it('should find matching entries via FTS5', async () => {
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

    it('should scope search to contextId', async () => {
      await store.append('ctx-a', 'TypeScript rocks', 'Indeed');
      await store.append('ctx-b', 'TypeScript is cool', 'Agreed');

      const results = await store.search('ctx-a', 'TypeScript');
      expect(results).toHaveLength(1);
      expect(results[0].agentResponse).toBe('Indeed');
    });
  });
});

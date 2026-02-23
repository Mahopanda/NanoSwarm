import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initSchema } from '../../src/store/schema.ts';
import { SQLiteMemoryStore } from '../../src/store/sqlite-memory-store.ts';

describe('SQLiteMemoryStore', () => {
  let db: Database;
  let store: SQLiteMemoryStore;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    store = new SQLiteMemoryStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return null for non-existent memory', async () => {
    const result = await store.getMemory('no-such-context');
    expect(result).toBeNull();
  });

  it('should save and retrieve memory', async () => {
    await store.saveMemory('ctx1', 'Hello world');
    const result = await store.getMemory('ctx1');
    expect(result).toBe('Hello world');
  });

  it('should overwrite existing memory', async () => {
    await store.saveMemory('ctx1', 'First');
    await store.saveMemory('ctx1', 'Second');
    const result = await store.getMemory('ctx1');
    expect(result).toBe('Second');
  });

  it('should isolate memory by contextId', async () => {
    await store.saveMemory('ctx-a', 'Memory A');
    await store.saveMemory('ctx-b', 'Memory B');

    expect(await store.getMemory('ctx-a')).toBe('Memory A');
    expect(await store.getMemory('ctx-b')).toBe('Memory B');
  });
});

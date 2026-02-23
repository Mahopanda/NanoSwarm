import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initSchema } from '../../src/store/schema.ts';
import { SQLiteTaskStore } from '../../src/store/sqlite-task-store.ts';

describe('SQLiteTaskStore', () => {
  let db: Database;
  let store: SQLiteTaskStore;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    store = new SQLiteTaskStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return undefined for non-existent task', async () => {
    const result = await store.load('no-such-task');
    expect(result).toBeUndefined();
  });

  it('should save and load a task', async () => {
    const task = {
      id: 'task-1',
      contextId: 'ctx1',
      status: { state: 'working' },
      history: [{ role: 'user', parts: [{ text: 'hello' }] }],
    };

    await store.save(task);
    const loaded = await store.load('task-1');

    expect(loaded).toEqual(task);
  });

  it('should upsert on save with same id', async () => {
    const task1 = { id: 'task-1', contextId: 'ctx1', status: { state: 'submitted' } };
    const task2 = { id: 'task-1', contextId: 'ctx1', status: { state: 'completed' } };

    await store.save(task1);
    await store.save(task2);

    const loaded = await store.load('task-1');
    expect(loaded.status.state).toBe('completed');
  });

  it('should preserve JSON round-trip fidelity', async () => {
    const task = {
      id: 'task-2',
      contextId: 'ctx1',
      nested: {
        array: [1, 'two', { three: true }],
        nullValue: null,
        number: 42.5,
      },
    };

    await store.save(task);
    const loaded = await store.load('task-2');
    expect(loaded).toEqual(task);
  });
});

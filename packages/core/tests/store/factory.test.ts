import { describe, it, expect, afterEach } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStores } from '../../src/store/factory.ts';
import { SQLiteMemoryStore } from '../../src/store/sqlite-memory-store.ts';
import { SQLiteHistoryStore } from '../../src/store/sqlite-history-store.ts';
import { SQLiteTaskStore } from '../../src/store/sqlite-task-store.ts';
import { SQLiteRegistryStore } from '../../src/store/sqlite-registry-store.ts';
import { FileMemoryStore } from '../../src/memory/memory-store.ts';
import { FileHistoryStore } from '../../src/memory/history-store.ts';
import type { Stores } from '../../src/store/types.ts';

describe('createStores', () => {
  let stores: Stores | null = null;

  afterEach(() => {
    stores?.close();
    stores = null;
  });

  describe('sqlite path', () => {
    it('should create SQLite-backed stores', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'nanoswarm-factory-'));
      stores = createStores({
        type: 'sqlite',
        sqlitePath: join(tempDir, 'test.db'),
      });

      expect(stores.memoryStore).toBeInstanceOf(SQLiteMemoryStore);
      expect(stores.historyStore).toBeInstanceOf(SQLiteHistoryStore);
      expect(stores.taskStore).toBeInstanceOf(SQLiteTaskStore);
      expect(stores.registryStore).toBeInstanceOf(SQLiteRegistryStore);
    });

    it('should produce working stores', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'nanoswarm-factory-'));
      stores = createStores({
        type: 'sqlite',
        sqlitePath: join(tempDir, 'test.db'),
      });

      await stores.memoryStore.saveMemory('ctx1', 'test');
      expect(await stores.memoryStore.getMemory('ctx1')).toBe('test');
    });
  });

  describe('file path', () => {
    it('should create file-backed stores', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'nanoswarm-factory-'));
      stores = createStores({ type: 'file', workspace: tempDir });

      expect(stores.memoryStore).toBeInstanceOf(FileMemoryStore);
      expect(stores.historyStore).toBeInstanceOf(FileHistoryStore);
    });

    it('should have no-op task and registry stores', async () => {
      const tempDir = await mkdtemp(join(tmpdir(), 'nanoswarm-factory-'));
      stores = createStores({ type: 'file', workspace: tempDir });

      // Task store is no-op
      await stores.taskStore.save({ id: 't1' });
      expect(await stores.taskStore.load('t1')).toBeUndefined();

      // Registry store is no-op
      expect(await stores.registryStore.listActive()).toEqual([]);
      expect(await stores.registryStore.unregister('x')).toBe(false);
    });
  });
});

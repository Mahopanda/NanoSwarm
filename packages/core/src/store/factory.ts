import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initSchema } from './schema.ts';
import { SQLiteMemoryStore } from './sqlite-memory-store.ts';
import { SQLiteHistoryStore } from './sqlite-history-store.ts';
import { SQLiteTaskStore } from './sqlite-task-store.ts';
import { SQLiteRegistryStore } from './sqlite-registry-store.ts';
import { FileMemoryStore } from '../memory/memory-store.ts';
import { FileHistoryStore } from '../memory/history-store.ts';
import type { StoreConfig, Stores, RegistryStore } from './types.ts';

export function createStores(config: StoreConfig): Stores {
  switch (config.type) {
    case 'sqlite': {
      const dbPath = config.sqlitePath ?? './data/nanoswarm.db';
      mkdirSync(dirname(dbPath), { recursive: true });
      const db = new Database(dbPath);
      initSchema(db);
      return {
        memoryStore: new SQLiteMemoryStore(db),
        historyStore: new SQLiteHistoryStore(db),
        taskStore: new SQLiteTaskStore(db),
        registryStore: new SQLiteRegistryStore(db),
        close: () => db.close(),
      };
    }
    case 'file': {
      const workspace = config.workspace ?? '.';
      const noopRegistryStore: RegistryStore = {
        async register() {},
        async get() { return undefined; },
        async findBySkill() { return []; },
        async listActive() { return []; },
        async unregister() { return false; },
      };
      return {
        memoryStore: new FileMemoryStore(workspace),
        historyStore: new FileHistoryStore(workspace),
        taskStore: {
          async save() {},
          async load() { return undefined; },
        },
        registryStore: noopRegistryStore,
        close: () => {},
      };
    }
  }
}

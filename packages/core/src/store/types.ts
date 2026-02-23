import type { MemoryStore } from '../memory/memory-store.ts';
import type { HistoryStore } from '../memory/history-store.ts';

export interface RegisteredAgent {
  id: string;
  name: string;
  url: string;
  agentCard: unknown;
  createdAt: Date;
  createdBy: 'system' | 'user' | 'self-generated';
  status: 'active' | 'inactive' | 'error';
  lastHealthCheck?: Date;
}

export interface RegistryStore {
  register(agent: RegisteredAgent): Promise<void>;
  get(id: string): Promise<RegisteredAgent | undefined>;
  findBySkill(query: string): Promise<RegisteredAgent[]>;
  listActive(): Promise<RegisteredAgent[]>;
  unregister(id: string): Promise<boolean>;
}

export interface StoreConfig {
  type: 'sqlite' | 'file';
  sqlitePath?: string;   // default: './data/nanoswarm.db'
  workspace?: string;    // for file-based fallback
}

export interface Stores {
  memoryStore: MemoryStore;
  historyStore: HistoryStore;
  taskStore: { save(task: any): Promise<void>; load(taskId: string): Promise<any | undefined> };
  registryStore: RegistryStore;
  close(): void;
}

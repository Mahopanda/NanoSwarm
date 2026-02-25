import type { MemoryStore } from './memory-store.ts';

export class CachedMemoryStore implements MemoryStore {
  private cache = new Map<string, string | null>();

  constructor(private inner: MemoryStore) {}

  async getMemory(contextId: string): Promise<string | null> {
    if (this.cache.has(contextId)) return this.cache.get(contextId) ?? null;
    const content = await this.inner.getMemory(contextId);
    this.cache.set(contextId, content);
    return content;
  }

  async saveMemory(contextId: string, content: string): Promise<void> {
    await this.inner.saveMemory(contextId, content);
    this.cache.set(contextId, content);
  }
}

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { CachedMemoryStore } from '../../src/memory/cached-memory-store.ts';
import type { MemoryStore } from '../../src/memory/memory-store.ts';

function createMockStore(data: Record<string, string> = {}): MemoryStore & { getMemoryCalls: number } {
  const store: Record<string, string> = { ...data };
  return {
    getMemoryCalls: 0,
    async getMemory(contextId: string) {
      this.getMemoryCalls++;
      return store[contextId] ?? null;
    },
    async saveMemory(contextId: string, content: string) {
      store[contextId] = content;
    },
  };
}

describe('CachedMemoryStore', () => {
  let inner: ReturnType<typeof createMockStore>;
  let cached: CachedMemoryStore;

  beforeEach(() => {
    inner = createMockStore({ ctx1: 'hello world' });
    cached = new CachedMemoryStore(inner);
  });

  it('should delegate first getMemory to inner store', async () => {
    const result = await cached.getMemory('ctx1');
    expect(result).toBe('hello world');
    expect(inner.getMemoryCalls).toBe(1);
  });

  it('should return cached value on second getMemory (no inner call)', async () => {
    await cached.getMemory('ctx1');
    await cached.getMemory('ctx1');
    expect(inner.getMemoryCalls).toBe(1);
  });

  it('should cache null for missing contextId', async () => {
    const r1 = await cached.getMemory('no-such');
    const r2 = await cached.getMemory('no-such');
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(inner.getMemoryCalls).toBe(1);
  });

  it('should update cache on saveMemory (write-through)', async () => {
    await cached.saveMemory('ctx1', 'updated');
    const result = await cached.getMemory('ctx1');
    expect(result).toBe('updated');
    expect(inner.getMemoryCalls).toBe(0); // served from cache, no inner read
  });

  it('should isolate cache by contextId', async () => {
    inner = createMockStore({ 'ctx-a': 'A', 'ctx-b': 'B' });
    cached = new CachedMemoryStore(inner);

    expect(await cached.getMemory('ctx-a')).toBe('A');
    expect(await cached.getMemory('ctx-b')).toBe('B');

    await cached.saveMemory('ctx-a', 'A2');
    expect(await cached.getMemory('ctx-a')).toBe('A2');
    expect(await cached.getMemory('ctx-b')).toBe('B');
  });
});

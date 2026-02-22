import { describe, it, expect, beforeEach } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileMemoryStore } from '../../src/memory/memory-store.ts';

describe('FileMemoryStore', () => {
  let tempDir: string;
  let store: FileMemoryStore;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'nanoswarm-mem-'));
    store = new FileMemoryStore(tempDir);
  });

  it('should return null for non-existent memory', async () => {
    const result = await store.getMemory('no-such-context');
    expect(result).toBeNull();
  });

  it('should save and retrieve memory', async () => {
    await store.saveMemory('ctx1', '# Memory\nSome context here');
    const result = await store.getMemory('ctx1');
    expect(result).toBe('# Memory\nSome context here');
  });

  it('should overwrite existing memory', async () => {
    await store.saveMemory('ctx1', 'old content');
    await store.saveMemory('ctx1', 'new content');
    const result = await store.getMemory('ctx1');
    expect(result).toBe('new content');
  });

  it('should isolate memories by contextId', async () => {
    await store.saveMemory('ctx-a', 'memory A');
    await store.saveMemory('ctx-b', 'memory B');
    expect(await store.getMemory('ctx-a')).toBe('memory A');
    expect(await store.getMemory('ctx-b')).toBe('memory B');
  });
});

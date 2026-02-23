import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { initSchema } from '../../src/store/schema.ts';
import { SQLiteRegistryStore } from '../../src/store/sqlite-registry-store.ts';
import type { RegisteredAgent } from '../../src/store/types.ts';

function makeAgent(overrides: Partial<RegisteredAgent> = {}): RegisteredAgent {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    url: 'http://localhost:3000',
    agentCard: {
      name: 'Test Agent',
      capabilities: {
        skills: [{ name: 'code-review' }, { name: 'testing' }],
      },
    },
    createdAt: new Date('2025-01-01T00:00:00Z'),
    createdBy: 'system',
    status: 'active',
    ...overrides,
  };
}

describe('SQLiteRegistryStore', () => {
  let db: Database;
  let store: SQLiteRegistryStore;

  beforeEach(() => {
    db = new Database(':memory:');
    initSchema(db);
    store = new SQLiteRegistryStore(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should return undefined for non-existent agent', async () => {
    const result = await store.get('no-such-agent');
    expect(result).toBeUndefined();
  });

  it('should register and get an agent', async () => {
    const agent = makeAgent();
    await store.register(agent);

    const loaded = await store.get('agent-1');
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Test Agent');
    expect(loaded!.url).toBe('http://localhost:3000');
    expect(loaded!.status).toBe('active');
    expect(loaded!.createdBy).toBe('system');
  });

  it('should upsert on register with same id', async () => {
    await store.register(makeAgent({ name: 'First' }));
    await store.register(makeAgent({ name: 'Updated' }));

    const loaded = await store.get('agent-1');
    expect(loaded!.name).toBe('Updated');
  });

  it('should list active agents', async () => {
    await store.register(makeAgent({ id: 'a1', status: 'active' }));
    await store.register(makeAgent({ id: 'a2', status: 'inactive' }));
    await store.register(makeAgent({ id: 'a3', status: 'active' }));

    const active = await store.listActive();
    expect(active).toHaveLength(2);
    const ids = active.map((a) => a.id).sort();
    expect(ids).toEqual(['a1', 'a3']);
  });

  describe('findBySkill', () => {
    it('should find agents by skill name', async () => {
      await store.register(makeAgent({ id: 'a1' }));
      const results = await store.findBySkill('code-review');
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('a1');
    });

    it('should return empty for no match', async () => {
      await store.register(makeAgent({ id: 'a1' }));
      const results = await store.findBySkill('deploy');
      expect(results).toEqual([]);
    });

    it('should not return inactive agents', async () => {
      await store.register(makeAgent({ id: 'a1', status: 'inactive' }));
      const results = await store.findBySkill('code-review');
      expect(results).toEqual([]);
    });

    it('should deduplicate results', async () => {
      // Agent with two skills that both match
      await store.register(
        makeAgent({
          id: 'a1',
          agentCard: {
            capabilities: {
              skills: [{ name: 'code-review' }, { name: 'code-analysis' }],
            },
          },
        }),
      );
      const results = await store.findBySkill('code');
      expect(results).toHaveLength(1);
    });
  });

  it('should unregister an existing agent', async () => {
    await store.register(makeAgent());
    const deleted = await store.unregister('agent-1');
    expect(deleted).toBe(true);

    const loaded = await store.get('agent-1');
    expect(loaded).toBeUndefined();
  });

  it('should return false when unregistering non-existent agent', async () => {
    const deleted = await store.unregister('no-such-agent');
    expect(deleted).toBe(false);
  });
});

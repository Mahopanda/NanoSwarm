import { describe, it, expect, mock } from 'bun:test';
import { Orchestrator } from '../src/orchestrator.ts';
import type { AgentStore, ResolvedAgent } from '../src/types.ts';
import type { NormalizedMessage } from '@nanoswarm/channels';

function createMockAgent(id = 'default', name = 'Default Agent', description?: string): ResolvedAgent {
  return {
    id,
    name,
    ...(description ? { description } : {}),
    handle: mock(async (_contextId: string, text: string) => ({
      text: `Response to: ${text}`,
    })),
  };
}

function createStore(agents: ResolvedAgent[], defaultId?: string): AgentStore {
  const map = new Map(agents.map(a => [a.id, a]));
  const defId = defaultId ?? (agents.length > 0 ? agents[0].id : undefined);
  return {
    get: (id) => map.get(id),
    getDefault: () => (defId ? map.get(defId) : undefined),
    list: () => agents.map(a => ({ id: a.id, name: a.name, description: a.description })),
    has: (id) => map.has(id),
  };
}

function createMessage(text = 'Hello', overrides: Partial<NormalizedMessage> = {}): NormalizedMessage {
  return {
    channelId: 'rest',
    userId: 'user-1',
    conversationId: 'conv-1',
    text,
    ...overrides,
  };
}

describe('Orchestrator', () => {
  describe('store-based resolution', () => {
    it('should resolve agent from store', async () => {
      const agent = createMockAgent();
      const orchestrator = new Orchestrator(createStore([agent]));

      const result = await orchestrator.invoke(undefined, 'conv-1', 'Hello!');
      expect(result.text).toBe('Response to: Hello!');
    });

    it('should use default agent from store', async () => {
      const agent1 = createMockAgent('a1', 'Agent 1');
      const agent2 = createMockAgent('a2', 'Agent 2');
      const orchestrator = new Orchestrator(createStore([agent1, agent2], 'a2'));

      const result = await orchestrator.invoke(undefined, 'conv-1', 'Hello!');
      expect(result.metadata?.agentId).toBe('a2');
    });
  });

  describe('invoke', () => {
    it('should invoke default agent when agentId is undefined', async () => {
      const agent = createMockAgent();
      const orchestrator = new Orchestrator(createStore([agent]));

      const result = await orchestrator.invoke(undefined, 'conv-1', 'Hello!');

      expect(result.text).toBe('Response to: Hello!');
      expect(result.metadata?.agentId).toBe('default');
      expect(agent.handle).toHaveBeenCalledWith('conv-1', 'Hello!', undefined, undefined);
    });

    it('should invoke specific agent by id', async () => {
      const agent1 = createMockAgent('coder', 'Coder');
      const agent2 = createMockAgent('writer', 'Writer');
      const orchestrator = new Orchestrator(createStore([agent1, agent2]));

      const result = await orchestrator.invoke('writer', 'conv-1', 'Hello');

      expect(result.text).toBe('Response to: Hello');
      expect(result.metadata?.agentId).toBe('writer');
      expect(agent2.handle).toHaveBeenCalled();
      expect(agent1.handle).not.toHaveBeenCalled();
    });

    it('should throw when agentId not found', async () => {
      const agent = createMockAgent();
      const orchestrator = new Orchestrator(createStore([agent]));

      await expect(orchestrator.invoke('ghost', 'conv-1', 'Hello')).rejects.toThrow(
        'Agent not found: ghost',
      );
    });

    it('should throw when no agent registered', async () => {
      const orchestrator = new Orchestrator(createStore([]));

      await expect(orchestrator.invoke(undefined, 'conv-1', 'Hello')).rejects.toThrow(
        'No agent registered',
      );
    });

    it('should pass history and opts to agent', async () => {
      const agent = createMockAgent();
      const orchestrator = new Orchestrator(createStore([agent]));

      const history = [{ role: 'user' as const, content: 'Hi' }];
      await orchestrator.invoke(undefined, 'conv-1', 'Hello', history, {
        channel: 'telegram',
        chatId: 'chat-1',
      });

      expect(agent.handle).toHaveBeenCalledWith('conv-1', 'Hello', history, {
        channel: 'telegram',
        chatId: 'chat-1',
      });
    });

    it('should create task and mark completed on success', async () => {
      const agent = createMockAgent();
      const orchestrator = new Orchestrator(createStore([agent]));

      await orchestrator.invoke(undefined, 'conv-1', 'Hello');

      const tasks = orchestrator.getTaskManager().listByContext('conv-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('completed');
      expect(tasks[0].agentId).toBe('default');
    });

    it('should mark task as failed when agent throws', async () => {
      const agent: ResolvedAgent = {
        id: 'failing',
        name: 'Failing Agent',
        handle: mock(async () => {
          throw new Error('Oops');
        }),
      };
      const orchestrator = new Orchestrator(createStore([agent]));

      try {
        await orchestrator.invoke(undefined, 'conv-1', 'Hello');
      } catch {
        // expected
      }

      const tasks = orchestrator.getTaskManager().listByContext('conv-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('failed');
    });
  });

  describe('handle', () => {
    it('should route message to default agent', async () => {
      const agent = createMockAgent();
      const orchestrator = new Orchestrator(createStore([agent]));

      const response = await orchestrator.handle(createMessage('Hello!'));

      expect(response.text).toBe('Response to: Hello!');
      expect(agent.handle).toHaveBeenCalledWith('conv-1', 'Hello!', undefined, {
        channel: 'rest',
        chatId: undefined,
      });
    });

    it('should throw when no agent is registered', async () => {
      const orchestrator = new Orchestrator(createStore([]));

      await expect(orchestrator.handle(createMessage())).rejects.toThrow('No agent registered');
    });

    it('should propagate agent errors', async () => {
      const agent: ResolvedAgent = {
        id: 'failing',
        name: 'Failing Agent',
        handle: mock(async () => {
          throw new Error('Agent error');
        }),
      };
      const orchestrator = new Orchestrator(createStore([agent]));

      await expect(orchestrator.handle(createMessage())).rejects.toThrow('Agent error');
    });

    it('should create a task record for each handled message', async () => {
      const agent = createMockAgent();
      const orchestrator = new Orchestrator(createStore([agent]));

      await orchestrator.handle(createMessage('Hello'));

      const tasks = orchestrator.getTaskManager().listByContext('conv-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('completed');
      expect(tasks[0].agentId).toBe('default');
    });

    it('should mark task as failed when agent throws', async () => {
      const agent: ResolvedAgent = {
        id: 'failing',
        name: 'Failing Agent',
        handle: mock(async () => {
          throw new Error('Oops');
        }),
      };
      const orchestrator = new Orchestrator(createStore([agent]));

      try {
        await orchestrator.handle(createMessage());
      } catch {
        // expected
      }

      const tasks = orchestrator.getTaskManager().listByContext('conv-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('failed');
    });

    it('should include metadata in response when agent returns it', async () => {
      const agent: ResolvedAgent = {
        id: 'meta',
        name: 'Meta Agent',
        handle: mock(async () => ({
          text: 'Hi',
          metadata: { model: 'test' },
        })),
      };
      const orchestrator = new Orchestrator(createStore([agent]));

      const response = await orchestrator.handle(createMessage());
      expect(response.metadata).toEqual({ model: 'test', agentId: 'meta' });
    });

    it('should route to specific agent when metadata.agentId matches', async () => {
      const agent1 = createMockAgent('coder', 'Coder');
      const agent2 = createMockAgent('writer', 'Writer');
      const orchestrator = new Orchestrator(createStore([agent1, agent2]));

      const response = await orchestrator.handle(
        createMessage('Hello', { metadata: { agentId: 'writer' } }),
      );

      expect(response.text).toBe('Response to: Hello');
      expect(agent2.handle).toHaveBeenCalledWith('conv-1', 'Hello', undefined, {
        channel: 'rest',
        chatId: undefined,
      });
      expect(agent1.handle).not.toHaveBeenCalled();
    });

    it('should fall back to default when no agentId in metadata', async () => {
      const agent1 = createMockAgent('coder', 'Coder');
      const agent2 = createMockAgent('writer', 'Writer');
      const orchestrator = new Orchestrator(createStore([agent1, agent2]));

      const response = await orchestrator.handle(createMessage('Hello'));

      expect(response.text).toBe('Response to: Hello');
      expect(agent1.handle).toHaveBeenCalled();
    });

    it('should throw Agent not found when agentId does not exist', async () => {
      const agent = createMockAgent('coder', 'Coder');
      const orchestrator = new Orchestrator(createStore([agent]));

      await expect(
        orchestrator.handle(createMessage('Hello', { metadata: { agentId: 'ghost' } })),
      ).rejects.toThrow('Agent not found: ghost');
    });

    it('should include agentId in response metadata', async () => {
      const agent = createMockAgent('coder', 'Coder');
      const orchestrator = new Orchestrator(createStore([agent]));

      const response = await orchestrator.handle(
        createMessage('Hello', { metadata: { agentId: 'coder' } }),
      );

      expect(response.metadata?.agentId).toBe('coder');
    });

    it('should record correct agentId in task when routed', async () => {
      const agent1 = createMockAgent('coder', 'Coder');
      const agent2 = createMockAgent('writer', 'Writer');
      const orchestrator = new Orchestrator(createStore([agent1, agent2]));

      await orchestrator.handle(
        createMessage('Hello', { metadata: { agentId: 'writer' } }),
      );

      const tasks = orchestrator.getTaskManager().listByContext('conv-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].agentId).toBe('writer');
    });
  });

  describe('listAgents', () => {
    it('should return all agents from store', () => {
      const agent1 = createMockAgent('coder', 'Coder');
      const agent2 = createMockAgent('writer', 'Writer');
      const orchestrator = new Orchestrator(createStore([agent1, agent2]));

      const list = orchestrator.listAgents();
      expect(list).toEqual([
        { id: 'coder', name: 'Coder' },
        { id: 'writer', name: 'Writer' },
      ]);
    });

    it('should include description when present', () => {
      const agent1 = createMockAgent('coder', 'Coder', 'A coding agent');
      const agent2 = createMockAgent('writer', 'Writer');
      const orchestrator = new Orchestrator(createStore([agent1, agent2]));

      const list = orchestrator.listAgents();
      expect(list).toEqual([
        { id: 'coder', name: 'Coder', description: 'A coding agent' },
        { id: 'writer', name: 'Writer' },
      ]);
    });
  });
});

import { describe, it, expect, mock } from 'bun:test';
import { Orchestrator } from '../src/orchestrator.ts';
import type { AgentHandle } from '../src/types.ts';
import type { NormalizedMessage } from '@nanoswarm/channels';

function createMockAgent(id = 'default', name = 'Default Agent', description?: string): AgentHandle {
  return {
    id,
    name,
    ...(description ? { description } : {}),
    handle: mock(async (_contextId: string, text: string) => ({
      text: `Response to: ${text}`,
    })),
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
  describe('registerAgent', () => {
    it('should register an agent', () => {
      const orchestrator = new Orchestrator();
      const agent = createMockAgent();
      orchestrator.registerAgent(agent);

      expect(orchestrator.getAgent('default')).toBe(agent);
    });

    it('should set first registered agent as default', () => {
      const orchestrator = new Orchestrator();
      const agent = createMockAgent();
      orchestrator.registerAgent(agent);

      expect(orchestrator.getDefaultAgent()).toBe(agent);
    });

    it('should allow explicit default override', () => {
      const orchestrator = new Orchestrator();
      const agent1 = createMockAgent('a1', 'Agent 1');
      const agent2 = createMockAgent('a2', 'Agent 2');

      orchestrator.registerAgent(agent1);
      orchestrator.registerAgent(agent2, { default: true });

      expect(orchestrator.getDefaultAgent()).toBe(agent2);
    });
  });

  describe('invoke', () => {
    it('should invoke default agent when agentId is undefined', async () => {
      const orchestrator = new Orchestrator();
      const agent = createMockAgent();
      orchestrator.registerAgent(agent);

      const result = await orchestrator.invoke(undefined, 'conv-1', 'Hello!');

      expect(result.text).toBe('Response to: Hello!');
      expect(result.metadata?.agentId).toBe('default');
      expect(agent.handle).toHaveBeenCalledWith('conv-1', 'Hello!', undefined, undefined);
    });

    it('should invoke specific agent by id', async () => {
      const orchestrator = new Orchestrator();
      const agent1 = createMockAgent('coder', 'Coder');
      const agent2 = createMockAgent('writer', 'Writer');
      orchestrator.registerAgent(agent1);
      orchestrator.registerAgent(agent2);

      const result = await orchestrator.invoke('writer', 'conv-1', 'Hello');

      expect(result.text).toBe('Response to: Hello');
      expect(result.metadata?.agentId).toBe('writer');
      expect(agent2.handle).toHaveBeenCalled();
      expect(agent1.handle).not.toHaveBeenCalled();
    });

    it('should throw when agentId not found', async () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent());

      await expect(orchestrator.invoke('ghost', 'conv-1', 'Hello')).rejects.toThrow(
        'Agent not found: ghost',
      );
    });

    it('should throw when no agent registered', async () => {
      const orchestrator = new Orchestrator();

      await expect(orchestrator.invoke(undefined, 'conv-1', 'Hello')).rejects.toThrow(
        'No agent registered',
      );
    });

    it('should pass history and opts to agent', async () => {
      const orchestrator = new Orchestrator();
      const agent = createMockAgent();
      orchestrator.registerAgent(agent);

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
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent());

      await orchestrator.invoke(undefined, 'conv-1', 'Hello');

      const tasks = orchestrator.getTaskManager().listByContext('conv-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('completed');
      expect(tasks[0].agentId).toBe('default');
    });

    it('should mark task as failed when agent throws', async () => {
      const orchestrator = new Orchestrator();
      const agent: AgentHandle = {
        id: 'failing',
        name: 'Failing Agent',
        handle: mock(async () => {
          throw new Error('Oops');
        }),
      };
      orchestrator.registerAgent(agent);

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
      const orchestrator = new Orchestrator();
      const agent = createMockAgent();
      orchestrator.registerAgent(agent);

      const response = await orchestrator.handle(createMessage('Hello!'));

      expect(response.text).toBe('Response to: Hello!');
      expect(agent.handle).toHaveBeenCalledWith('conv-1', 'Hello!', undefined, {
        channel: 'rest',
        chatId: undefined,
      });
    });

    it('should throw when no agent is registered', async () => {
      const orchestrator = new Orchestrator();

      await expect(orchestrator.handle(createMessage())).rejects.toThrow('No agent registered');
    });

    it('should propagate agent errors', async () => {
      const orchestrator = new Orchestrator();
      const agent: AgentHandle = {
        id: 'failing',
        name: 'Failing Agent',
        handle: mock(async () => {
          throw new Error('Agent error');
        }),
      };
      orchestrator.registerAgent(agent);

      await expect(orchestrator.handle(createMessage())).rejects.toThrow('Agent error');
    });

    it('should create a task record for each handled message', async () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent());

      await orchestrator.handle(createMessage('Hello'));

      const tasks = orchestrator.getTaskManager().listByContext('conv-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].state).toBe('completed');
      expect(tasks[0].agentId).toBe('default');
    });

    it('should mark task as failed when agent throws', async () => {
      const orchestrator = new Orchestrator();
      const agent: AgentHandle = {
        id: 'failing',
        name: 'Failing Agent',
        handle: mock(async () => {
          throw new Error('Oops');
        }),
      };
      orchestrator.registerAgent(agent);

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
      const orchestrator = new Orchestrator();
      const agent: AgentHandle = {
        id: 'meta',
        name: 'Meta Agent',
        handle: mock(async () => ({
          text: 'Hi',
          metadata: { model: 'test' },
        })),
      };
      orchestrator.registerAgent(agent);

      const response = await orchestrator.handle(createMessage());
      expect(response.metadata).toEqual({ model: 'test', agentId: 'meta' });
    });

    it('should route to specific agent when metadata.agentId matches', async () => {
      const orchestrator = new Orchestrator();
      const agent1 = createMockAgent('coder', 'Coder');
      const agent2 = createMockAgent('writer', 'Writer');
      orchestrator.registerAgent(agent1);
      orchestrator.registerAgent(agent2);

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
      const orchestrator = new Orchestrator();
      const agent1 = createMockAgent('coder', 'Coder');
      const agent2 = createMockAgent('writer', 'Writer');
      orchestrator.registerAgent(agent1);
      orchestrator.registerAgent(agent2);

      const response = await orchestrator.handle(createMessage('Hello'));

      expect(response.text).toBe('Response to: Hello');
      expect(agent1.handle).toHaveBeenCalled();
    });

    it('should throw Agent not found when agentId does not exist', async () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('coder', 'Coder'));

      await expect(
        orchestrator.handle(createMessage('Hello', { metadata: { agentId: 'ghost' } })),
      ).rejects.toThrow('Agent not found: ghost');
    });

    it('should include agentId in response metadata', async () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('coder', 'Coder'));

      const response = await orchestrator.handle(
        createMessage('Hello', { metadata: { agentId: 'coder' } }),
      );

      expect(response.metadata?.agentId).toBe('coder');
    });

    it('should record correct agentId in task when routed', async () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('coder', 'Coder'));
      orchestrator.registerAgent(createMockAgent('writer', 'Writer'));

      await orchestrator.handle(
        createMessage('Hello', { metadata: { agentId: 'writer' } }),
      );

      const tasks = orchestrator.getTaskManager().listByContext('conv-1');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].agentId).toBe('writer');
    });
  });

  describe('unregisterAgent', () => {
    it('should remove an existing agent', () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('a1', 'Agent 1'));

      expect(orchestrator.unregisterAgent('a1')).toBe(true);
      expect(orchestrator.getAgent('a1')).toBeUndefined();
    });

    it('should return false for non-existent id', () => {
      const orchestrator = new Orchestrator();
      expect(orchestrator.unregisterAgent('ghost')).toBe(false);
    });

    it('should reassign default when default agent is removed', () => {
      const orchestrator = new Orchestrator();
      const agent1 = createMockAgent('a1', 'Agent 1');
      const agent2 = createMockAgent('a2', 'Agent 2');
      orchestrator.registerAgent(agent1);
      orchestrator.registerAgent(agent2);

      expect(orchestrator.getDefaultAgent()).toBe(agent1);

      orchestrator.unregisterAgent('a1');
      expect(orchestrator.getDefaultAgent()).toBe(agent2);
    });

    it('should set default to null when last agent is removed', () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('a1', 'Agent 1'));

      orchestrator.unregisterAgent('a1');
      expect(orchestrator.getDefaultAgent()).toBeUndefined();
    });

    it('should not change default when non-default agent is removed', () => {
      const orchestrator = new Orchestrator();
      const agent1 = createMockAgent('a1', 'Agent 1');
      const agent2 = createMockAgent('a2', 'Agent 2');
      orchestrator.registerAgent(agent1);
      orchestrator.registerAgent(agent2);

      orchestrator.unregisterAgent('a2');
      expect(orchestrator.getDefaultAgent()).toBe(agent1);
    });

    it('should not list removed agent', () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('a1', 'Agent 1'));
      orchestrator.registerAgent(createMockAgent('a2', 'Agent 2'));

      orchestrator.unregisterAgent('a1');
      const list = orchestrator.listAgents();
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe('a2');
    });

    it('should throw when invoking removed agent', async () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('a1', 'Agent 1'));
      orchestrator.unregisterAgent('a1');

      await expect(orchestrator.invoke('a1', 'conv-1', 'Hello')).rejects.toThrow(
        'Agent not found: a1',
      );
    });
  });

  describe('listAgents', () => {
    it('should return all registered agents', () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('coder', 'Coder'));
      orchestrator.registerAgent(createMockAgent('writer', 'Writer'));

      const list = orchestrator.listAgents();
      expect(list).toEqual([
        { id: 'coder', name: 'Coder' },
        { id: 'writer', name: 'Writer' },
      ]);
    });

    it('should include description when present', () => {
      const orchestrator = new Orchestrator();
      orchestrator.registerAgent(createMockAgent('coder', 'Coder', 'A coding agent'));
      orchestrator.registerAgent(createMockAgent('writer', 'Writer'));

      const list = orchestrator.listAgents();
      expect(list).toEqual([
        { id: 'coder', name: 'Coder', description: 'A coding agent' },
        { id: 'writer', name: 'Writer' },
      ]);
    });
  });
});

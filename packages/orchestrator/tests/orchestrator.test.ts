import { describe, it, expect, mock } from 'bun:test';
import { Orchestrator } from '../src/orchestrator.ts';
import type { AgentHandle } from '../src/types.ts';
import type { NormalizedMessage } from '@nanoswarm/channels';

function createMockAgent(id = 'default', name = 'Default Agent'): AgentHandle {
  return {
    id,
    name,
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

  describe('handle', () => {
    it('should route message to default agent', async () => {
      const orchestrator = new Orchestrator();
      const agent = createMockAgent();
      orchestrator.registerAgent(agent);

      const response = await orchestrator.handle(createMessage('Hello!'));

      expect(response.text).toBe('Response to: Hello!');
      expect(agent.handle).toHaveBeenCalledWith('conv-1', 'Hello!');
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
      expect(response.metadata).toEqual({ model: 'test' });
    });
  });
});

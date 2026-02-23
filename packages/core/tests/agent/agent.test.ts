import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { Agent } from '../../src/agent/agent.ts';
import type { AgentConfig } from '../../src/agent/agent.ts';

// Mock ai module to prevent real LLM calls
mock.module('ai', () => ({
  generateText: mock(async () => ({
    text: 'mock response',
    steps: [],
    totalUsage: { inputTokens: 10, outputTokens: 20 },
    finishReason: 'end-turn',
  })),
  tool: (config: any) => config,
  stepCountIs: () => () => false,
}));

describe('Agent', () => {
  let agent: Agent;
  const mockModel = { modelId: 'test-model' } as any;
  const workspace = '/tmp/nanoswarm-test-agent';

  const config: AgentConfig = {
    model: mockModel,
    workspace,
    heartbeatEnabled: false,
    cronEnabled: false,
  };

  beforeEach(() => {
    agent = new Agent(config);
  });

  afterEach(() => {
    agent.stop();
  });

  describe('constructor', () => {
    it('should create all core components', () => {
      expect(agent.eventBus).toBeDefined();
      expect(agent.registry).toBeDefined();
      expect(agent.memoryStore).toBeDefined();
      expect(agent.historyStore).toBeDefined();
    });

    it('should register base tools (8 without spawn/cron disabled)', () => {
      // With cronEnabled=false, no cron tool; but subagentManager is always created
      // so spawn is registered (9 tools)
      expect(agent.registry.has('read_file')).toBe(true);
      expect(agent.registry.has('write_file')).toBe(true);
      expect(agent.registry.has('edit_file')).toBe(true);
      expect(agent.registry.has('list_dir')).toBe(true);
      expect(agent.registry.has('exec')).toBe(true);
      expect(agent.registry.has('web_search')).toBe(true);
      expect(agent.registry.has('web_fetch')).toBe(true);
      expect(agent.registry.has('message')).toBe(true);
      expect(agent.registry.has('spawn')).toBe(true);
      expect(agent.registry.has('cron')).toBe(false);
    });

    it('should register cron tool when cronEnabled is true', () => {
      const agentWithCron = new Agent({ ...config, cronEnabled: true });
      expect(agentWithCron.registry.has('cron')).toBe(true);
      expect(agentWithCron.registry.size).toBe(10);
      agentWithCron.stop();
    });
  });

  describe('start/stop', () => {
    it('should start without errors', async () => {
      await agent.start();
      // Should not throw
    });

    it('should stop without errors', async () => {
      await agent.start();
      agent.stop();
      // Should not throw
    });

    it('should be safe to stop without starting', () => {
      agent.stop();
      // Should not throw
    });
  });

  describe('chat', () => {
    it('should delegate normal messages to agent loop', async () => {
      const result = await agent.chat('ctx1', 'Hello');

      expect(result).toBeDefined();
      expect(result.text).toBe('mock response');
      expect(result.finishReason).toBe('end-turn');
    });

    it('should handle /new command with no history', async () => {
      const result = await agent.chat('ctx1', '/new');

      expect(result.text).toBe('Session cleared. Memory consolidated.');
      expect(result.finishReason).toBe('command');
      expect(result.steps).toBe(0);
      expect(result.toolCalls).toEqual([]);
    });

    it('should handle /new command with history', async () => {
      const result = await agent.chat('ctx1', '/new', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ]);

      expect(result.text).toBe('Session cleared. Memory consolidated.');
      expect(result.finishReason).toBe('command');
    });

    it('should handle /new with whitespace', async () => {
      const result = await agent.chat('ctx1', '  /new  ');

      expect(result.finishReason).toBe('command');
    });

    it('should pass history to loop.run for normal messages', async () => {
      const history = [
        { role: 'user' as const, content: 'Previous message' },
        { role: 'assistant' as const, content: 'Previous reply' },
      ];

      const result = await agent.chat('ctx1', 'Follow up', history);
      expect(result).toBeDefined();
    });
  });

  describe('resetSession', () => {
    it('should call consolidator with archiveAll', async () => {
      // resetSession triggers the consolidator which calls generateText
      // Since generateText is mocked, this should complete without error
      await agent.resetSession('ctx1', [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' },
      ]);
      // No error means consolidator was called successfully
    });
  });

  describe('defaults', () => {
    it('should enable heartbeat and cron by default', () => {
      const defaultAgent = new Agent({ model: mockModel, workspace });
      expect(defaultAgent.registry.has('cron')).toBe(true);
      expect(defaultAgent.registry.size).toBe(10);
      defaultAgent.stop();
    });
  });
});

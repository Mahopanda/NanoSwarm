import { describe, it, expect, mock } from 'bun:test';
import { A2ARouter } from '../src/router.ts';
import { AgentRegistry } from '../src/registry.ts';
import type { InternalAgentEntry, AgentHandler } from '../src/types.ts';
import type { AgentCard } from '@a2a-js/sdk';

function createMockCard(): AgentCard {
  return {
    name: 'Test',
    description: 'Test agent',
    version: '0.1.0',
    protocolVersion: '0.3.0',
    url: 'http://localhost:4000/a2a/jsonrpc',
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    skills: [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
  };
}

function createEntry(id: string): InternalAgentEntry {
  return {
    id,
    card: createMockCard(),
    handler: {
      chat: mock(async () => ({ text: `Response from ${id}` })),
    },
  };
}

describe('A2ARouter', () => {
  describe('resolve', () => {
    it('should resolve agent by id', () => {
      const registry = new AgentRegistry();
      const entry = createEntry('agent-1');
      registry.register(entry);

      const router = new A2ARouter(registry);
      const handler = router.resolve('agent-1');

      expect(handler).toBe(entry.handler);
    });

    it('should resolve default agent when no id given', () => {
      const registry = new AgentRegistry();
      const entry = createEntry('default');
      registry.register(entry);

      const router = new A2ARouter(registry);
      const handler = router.resolve();

      expect(handler).toBe(entry.handler);
    });

    it('should throw for unknown agent id', () => {
      const registry = new AgentRegistry();
      const router = new A2ARouter(registry);

      expect(() => router.resolve('nonexistent')).toThrow('Agent not found: nonexistent');
    });

    it('should throw when no default agent registered', () => {
      const registry = new AgentRegistry();
      const router = new A2ARouter(registry);

      expect(() => router.resolve()).toThrow('No default agent registered');
    });
  });
});

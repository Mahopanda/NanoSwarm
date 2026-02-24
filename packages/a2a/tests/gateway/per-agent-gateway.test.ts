import { describe, it, expect, mock, afterEach } from 'bun:test';
import express from 'express';
import type { Server } from 'node:http';
import { createPerAgentGateway } from '../../src/gateway/per-agent-gateway.ts';
import type { InvokeAgentFn } from '../../src/types.ts';
import type { AgentCard } from '@a2a-js/sdk';

function createMockCard(agentId: string): AgentCard {
  return {
    name: `Agent-${agentId}`,
    description: `Test agent ${agentId}`,
    version: '0.1.0',
    protocolVersion: '0.3.0',
    url: `http://localhost:4000/a2a/agents/${agentId}/jsonrpc`,
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    skills: [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
  };
}

function listenOnRandomPort(app: express.Express): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({ server, port });
    });
  });
}

describe('createPerAgentGateway', () => {
  let server: Server | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  const knownAgents = new Set(['coder', 'writer']);

  function setup() {
    const invokeAgent: InvokeAgentFn = mock(async () => ({ text: 'per-agent response' }));
    const getCard = (agentId: string): AgentCard | undefined => {
      if (!knownAgents.has(agentId)) return undefined;
      return createMockCard(agentId);
    };

    const { router, invalidate } = createPerAgentGateway({ getCard, invokeAgent });

    const app = express();
    app.use(express.json());
    app.use('/a2a', router);

    return { app, invokeAgent, invalidate };
  }

  describe('Agent Card endpoint', () => {
    it('should return agent card for known agent', async () => {
      const { app } = setup();
      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(
        `http://127.0.0.1:${result.port}/a2a/agents/coder/.well-known/agent-card.json`,
      );
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.name).toBe('Agent-coder');
      expect(body.url).toContain('/a2a/agents/coder/jsonrpc');
    });

    it('should return 404 for unknown agent', async () => {
      const { app } = setup();
      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(
        `http://127.0.0.1:${result.port}/a2a/agents/unknown/.well-known/agent-card.json`,
      );
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.error).toContain('unknown');
    });
  });

  describe('JSON-RPC endpoint', () => {
    it('should handle JSON-RPC request for known agent', async () => {
      const { app } = setup();
      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(
        `http://127.0.0.1:${result.port}/a2a/agents/coder/jsonrpc`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'message/send',
            params: {
              message: {
                kind: 'message',
                messageId: crypto.randomUUID(),
                role: 'user',
                parts: [{ kind: 'text', text: 'Hello coder!' }],
              },
            },
          }),
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
    });

    it('should return 404 for unknown agent', async () => {
      const { app } = setup();
      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(
        `http://127.0.0.1:${result.port}/a2a/agents/unknown/jsonrpc`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'message/send',
            params: {
              message: {
                kind: 'message',
                messageId: crypto.randomUUID(),
                role: 'user',
                parts: [{ kind: 'text', text: 'Hello!' }],
              },
            },
          }),
        },
      );

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain('unknown');
    });
  });

  describe('invalidate', () => {
    it('should clear cached handler so it gets recreated on next request', async () => {
      const { app, invalidate } = setup();
      const result = await listenOnRandomPort(app);
      server = result.server;

      // First request — creates handler
      const resp1 = await fetch(
        `http://127.0.0.1:${result.port}/a2a/agents/coder/jsonrpc`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'message/send',
            params: {
              message: {
                kind: 'message',
                messageId: crypto.randomUUID(),
                role: 'user',
                parts: [{ kind: 'text', text: 'Hello!' }],
              },
            },
          }),
        },
      );
      expect(resp1.status).toBe(200);

      // Invalidate
      invalidate('coder');

      // Second request — handler should be recreated
      const resp2 = await fetch(
        `http://127.0.0.1:${result.port}/a2a/agents/coder/jsonrpc`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'message/send',
            params: {
              message: {
                kind: 'message',
                messageId: crypto.randomUUID(),
                role: 'user',
                parts: [{ kind: 'text', text: 'Hello again!' }],
              },
            },
          }),
        },
      );
      expect(resp2.status).toBe(200);
      const body = await resp2.json();
      expect(body.id).toBe(2);
    });
  });
});

import { describe, it, expect, mock, afterEach } from 'bun:test';
import express from 'express';
import type { Server } from 'node:http';
import { createGateway } from '../../src/gateway/gateway.ts';
import { AgentRegistry } from '../../src/registry.ts';
import type { AgentCard } from '@a2a-js/sdk';

function createMockCard(): AgentCard {
  return {
    name: 'TestAgent',
    description: 'A test agent',
    version: '0.1.0',
    protocolVersion: '0.3.0',
    url: 'http://localhost:4000/a2a/jsonrpc',
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    skills: [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
  };
}

function createRegistryWithAgent(): AgentRegistry {
  const registry = new AgentRegistry();
  registry.register({
    id: 'default',
    card: createMockCard(),
    handler: {
      chat: mock(async () => ({ text: 'Hello from gateway agent' })),
    },
  });
  return registry;
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

describe('createGateway', () => {
  let server: Server | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it('should throw when no default agent registered', () => {
    const registry = new AgentRegistry();
    expect(() => createGateway({ registry })).toThrow('no default agent registered');
  });

  it('should serve agent card at /.well-known/agent-card.json', async () => {
    const registry = createRegistryWithAgent();
    const app = express();
    app.use(createGateway({ registry }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/.well-known/agent-card.json`);
    expect(response.status).toBe(200);

    const card = await response.json();
    expect(card.name).toBe('TestAgent');
    expect(card.protocolVersion).toBe('0.3.0');
    expect(card.capabilities).toBeDefined();
  });

  it('should handle JSON-RPC at /a2a/jsonrpc', async () => {
    const registry = createRegistryWithAgent();
    const app = express();
    app.use(createGateway({ registry }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    // Send a valid JSON-RPC request
    const response = await fetch(`http://127.0.0.1:${result.port}/a2a/jsonrpc`, {
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
    });

    // We expect a successful response (JSON-RPC result)
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.jsonrpc).toBe('2.0');
    expect(body.id).toBe(1);
  });
});

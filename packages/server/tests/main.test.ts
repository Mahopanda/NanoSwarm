import { describe, it, expect, mock, afterEach } from 'bun:test';
import type { Server } from 'node:http';
import type { ServerConfig } from '../src/types.ts';

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

// Dynamic import after mocking
const { createServer } = await import('../src/main.ts');

const mockModel = { modelId: 'test-model' } as any;

function listenOnRandomPort(app: any): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' ? addr!.port : 0;
      resolve({ server, port });
    });
  });
}

describe('createServer', () => {
  let httpServer: Server | null = null;
  let nanoServer: Awaited<ReturnType<typeof createServer>> | null = null;

  afterEach(() => {
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }
    if (nanoServer) {
      nanoServer.stop();
      nanoServer = null;
    }
  });

  it('should create a server with app and agent', async () => {
    nanoServer = await createServer({
      model: mockModel,
      workspace: '/tmp/nanoswarm-server-test',
      heartbeatEnabled: false,
      cronEnabled: false,
    } as ServerConfig);

    expect(nanoServer.app).toBeDefined();
    expect(nanoServer.agent).toBeDefined();
    expect(nanoServer.start).toBeInstanceOf(Function);
    expect(nanoServer.stop).toBeInstanceOf(Function);
  });

  describe('HTTP endpoints', () => {
    it('GET /health should return status ok', async () => {
      nanoServer = await createServer({
        model: mockModel,
        workspace: '/tmp/nanoswarm-server-test',
        name: 'TestAgent',
        version: '0.2.0',
        heartbeatEnabled: false,
        cronEnabled: false,
      } as ServerConfig);

      const { server, port } = await listenOnRandomPort(nanoServer.app);
      httpServer = server;

      const response = await fetch(`http://127.0.0.1:${port}/health`);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.status).toBe('ok');
      expect(body.name).toBe('TestAgent');
      expect(body.version).toBe('0.2.0');
      expect(typeof body.uptime).toBe('number');
    });

    it('GET /.well-known/agent-card.json should return valid agent card', async () => {
      nanoServer = await createServer({
        model: mockModel,
        workspace: '/tmp/nanoswarm-server-test',
        name: 'CardTestAgent',
        heartbeatEnabled: false,
        cronEnabled: false,
      } as ServerConfig);

      const { server, port } = await listenOnRandomPort(nanoServer.app);
      httpServer = server;

      const response = await fetch(`http://127.0.0.1:${port}/.well-known/agent-card.json`);
      expect(response.status).toBe(200);

      const card = await response.json();
      expect(card.name).toBe('CardTestAgent');
      expect(card.protocolVersion).toBe('0.3.0');
      expect(card.capabilities).toBeDefined();
      expect(card.url).toContain('/a2a/jsonrpc');
    });

    it('POST /api/chat should handle REST channel', async () => {
      nanoServer = await createServer({
        model: mockModel,
        workspace: '/tmp/nanoswarm-server-test',
        name: 'ChatTestAgent',
        heartbeatEnabled: false,
        cronEnabled: false,
      } as ServerConfig);

      const { server, port } = await listenOnRandomPort(nanoServer.app);
      httpServer = server;

      const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Hello!',
          userId: 'test-user',
        }),
      });

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.text).toBeDefined();
      expect(body.conversationId).toBeDefined();
    });
  });
});

import { describe, it, expect, mock, afterEach } from 'bun:test';
import express from 'express';
import type { Server } from 'node:http';
import { createRestRouter } from '../src/rest.ts';
import type { MessageHandler, NormalizedMessage, NormalizedResponse } from '../src/types.ts';

function createTestHandler(response: NormalizedResponse = { text: 'Hello back!' }) {
  let lastMessage: NormalizedMessage | null = null;
  const handler: MessageHandler & { lastMessage: NormalizedMessage | null } = {
    lastMessage: null,
    handle: mock(async (msg: NormalizedMessage) => {
      handler.lastMessage = msg;
      return response;
    }),
  };
  return handler;
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

describe('createRestRouter', () => {
  let server: Server | null = null;

  afterEach(() => {
    if (server) {
      server.close();
      server = null;
    }
  });

  it('should handle POST /chat with valid body', async () => {
    const handler = createTestHandler({ text: 'Hi there!' });
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Hello!',
        userId: 'user-1',
        conversationId: 'conv-1',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.text).toBe('Hi there!');
    expect(body.conversationId).toBe('conv-1');

    expect(handler.lastMessage).not.toBeNull();
    expect(handler.lastMessage!.channelId).toBe('rest');
    expect(handler.lastMessage!.userId).toBe('user-1');
    expect(handler.lastMessage!.conversationId).toBe('conv-1');
    expect(handler.lastMessage!.text).toBe('Hello!');
  });

  it('should use defaults for optional fields', async () => {
    const handler = createTestHandler();
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello!' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversationId).toBeDefined();

    expect(handler.lastMessage!.userId).toBe('anonymous');
    expect(handler.lastMessage!.conversationId).toBeDefined();
  });

  it('should return 400 when message is missing', async () => {
    const handler = createTestHandler();
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user-1' }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain('message');
  });

  it('should return 400 when message is not a string', async () => {
    const handler = createTestHandler();
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 123 }),
    });

    expect(response.status).toBe(400);
  });

  it('should return 500 when handler throws', async () => {
    const handler: MessageHandler = {
      handle: mock(async () => {
        throw new Error('Handler failed');
      }),
    };
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello!' }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe('Handler failed');
  });

  it('should include metadata in response when present', async () => {
    const handler = createTestHandler({
      text: 'Response',
      metadata: { model: 'test-model' },
    });
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello!' }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.metadata).toEqual({ model: 'test-model' });
  });

  it('should pass agentId through metadata to handler', async () => {
    const handler = createTestHandler();
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    await fetch(`http://127.0.0.1:${result.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello!', agentId: 'coder' }),
    });

    expect(handler.lastMessage!.metadata).toEqual({ agentId: 'coder' });
  });

  it('should not set metadata when agentId is absent', async () => {
    const handler = createTestHandler();
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    await fetch(`http://127.0.0.1:${result.port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello!' }),
    });

    expect(handler.lastMessage!.metadata).toBeUndefined();
  });

  it('should return agent list when listAgents is provided', async () => {
    const handler = createTestHandler();
    const app = express();
    app.use('/api', createRestRouter({
      handler,
      listAgents: () => [
        { id: 'coder', name: 'Coder' },
        { id: 'writer', name: 'Writer', description: 'A writer agent' },
      ],
    }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/api/agents`);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.agents).toEqual([
      { id: 'coder', name: 'Coder' },
      { id: 'writer', name: 'Writer', description: 'A writer agent' },
    ]);
  });

  it('should return 404 for GET /agents when listAgents is not provided', async () => {
    const handler = createTestHandler();
    const app = express();
    app.use('/api', createRestRouter({ handler }));

    const result = await listenOnRandomPort(app);
    server = result.server;

    const response = await fetch(`http://127.0.0.1:${result.port}/api/agents`);
    expect(response.status).toBe(404);
  });

  describe('POST /agents/register', () => {
    it('should register an agent successfully', async () => {
      const handler = createTestHandler();
      const onRegisterAgent = mock(async () => {});
      const app = express();
      app.use('/api', createRestRouter({ handler, onRegisterAgent }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'ext1', name: 'External', url: 'http://other:5000' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.agentId).toBe('ext1');
      expect(onRegisterAgent).toHaveBeenCalled();
    });

    it('should return 400 when required fields are missing', async () => {
      const handler = createTestHandler();
      const onRegisterAgent = mock(async () => {});
      const app = express();
      app.use('/api', createRestRouter({ handler, onRegisterAgent }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'ext1' }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Missing required fields');
      expect(onRegisterAgent).not.toHaveBeenCalled();
    });

    it('should return 500 when registration callback throws', async () => {
      const handler = createTestHandler();
      const onRegisterAgent = mock(async () => {
        throw new Error('Agent already exists: ext1');
      });
      const app = express();
      app.use('/api', createRestRouter({ handler, onRegisterAgent }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'ext1', name: 'External', url: 'http://other:5000' }),
      });

      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error).toContain('Agent already exists');
    });
  });

  describe('DELETE /agents/:id', () => {
    it('should unregister an agent successfully', async () => {
      const handler = createTestHandler();
      const onUnregisterAgent = mock(async () => true);
      const app = express();
      app.use('/api', createRestRouter({ handler, onUnregisterAgent }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/ext1`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(onUnregisterAgent).toHaveBeenCalledWith('ext1');
    });

    it('should return 404 when agent not found', async () => {
      const handler = createTestHandler();
      const onUnregisterAgent = mock(async () => false);
      const app = express();
      app.use('/api', createRestRouter({ handler, onUnregisterAgent }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/unknown`, {
        method: 'DELETE',
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toContain('Agent not found');
    });
  });

  describe('adminApiKey authentication', () => {
    const API_KEY = 'test-secret-key';

    it('should return 401 for register without header', async () => {
      const handler = createTestHandler();
      const onRegisterAgent = mock(async () => {});
      const app = express();
      app.use('/api', createRestRouter({ handler, onRegisterAgent, adminApiKey: API_KEY }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'ext1', name: 'External', url: 'http://other:5000' }),
      });

      expect(response.status).toBe(401);
      expect(onRegisterAgent).not.toHaveBeenCalled();
    });

    it('should return 401 for register with wrong key', async () => {
      const handler = createTestHandler();
      const onRegisterAgent = mock(async () => {});
      const app = express();
      app.use('/api', createRestRouter({ handler, onRegisterAgent, adminApiKey: API_KEY }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer wrong-key',
        },
        body: JSON.stringify({ id: 'ext1', name: 'External', url: 'http://other:5000' }),
      });

      expect(response.status).toBe(401);
      expect(onRegisterAgent).not.toHaveBeenCalled();
    });

    it('should allow register with correct key', async () => {
      const handler = createTestHandler();
      const onRegisterAgent = mock(async () => {});
      const app = express();
      app.use('/api', createRestRouter({ handler, onRegisterAgent, adminApiKey: API_KEY }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ id: 'ext1', name: 'External', url: 'http://other:5000' }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
    });

    it('should allow delete with correct key', async () => {
      const handler = createTestHandler();
      const onUnregisterAgent = mock(async () => true);
      const app = express();
      app.use('/api', createRestRouter({ handler, onUnregisterAgent, adminApiKey: API_KEY }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const response = await fetch(`http://127.0.0.1:${result.port}/api/agents/ext1`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${API_KEY}` },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
    });

    it('should allow admin endpoints without key when adminApiKey is not set', async () => {
      const handler = createTestHandler();
      const onRegisterAgent = mock(async () => {});
      const onUnregisterAgent = mock(async () => true);
      const app = express();
      app.use('/api', createRestRouter({ handler, onRegisterAgent, onUnregisterAgent }));

      const result = await listenOnRandomPort(app);
      server = result.server;

      const regResponse = await fetch(`http://127.0.0.1:${result.port}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'ext1', name: 'External', url: 'http://other:5000' }),
      });
      expect(regResponse.status).toBe(200);

      const delResponse = await fetch(`http://127.0.0.1:${result.port}/api/agents/ext1`, {
        method: 'DELETE',
      });
      expect(delResponse.status).toBe(200);
    });
  });
});

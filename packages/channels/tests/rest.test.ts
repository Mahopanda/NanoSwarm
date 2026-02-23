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
});

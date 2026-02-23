import { Router, json } from 'express';
import type { MessageHandler, NormalizedMessage } from './types.ts';

export interface RestRouterOptions {
  handler: MessageHandler;
  listAgents?: () => Array<{ id: string; name: string; description?: string }>;
}

export function createRestRouter(options: RestRouterOptions): Router {
  const router = Router();
  router.use(json());

  router.post('/chat', async (req, res) => {
    const { message, userId, conversationId, agentId } = req.body as {
      message?: string;
      userId?: string;
      conversationId?: string;
      agentId?: string;
    };

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Missing required field: message' });
      return;
    }

    const normalized: NormalizedMessage = {
      channelId: 'rest',
      userId: userId ?? 'anonymous',
      conversationId: conversationId ?? crypto.randomUUID(),
      text: message,
      ...(agentId ? { metadata: { agentId } } : {}),
    };

    try {
      const response = await options.handler.handle(normalized);
      res.json({
        text: response.text,
        conversationId: normalized.conversationId,
        ...(response.metadata ? { metadata: response.metadata } : {}),
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  if (options.listAgents) {
    router.get('/agents', (_req, res) => {
      res.json({ agents: options.listAgents!() });
    });
  }

  return router;
}

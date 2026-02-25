import { Router, json, type Request, type Response, type NextFunction } from 'express';
import type { MessageHandler, NormalizedMessage } from './types.ts';

export interface RestRouterOptions {
  handler: MessageHandler;
  adminApiKey?: string;
  listAgents?: () => Array<{ id: string; name: string; description?: string }>;
  onRegisterAgent?: (body: { id: string; name: string; url: string; description?: string }) => Promise<void>;
  onUnregisterAgent?: (id: string) => Promise<boolean>;
}

function requireApiKey(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${apiKey}`) {
      res.status(401).json({ error: 'Unauthorized: invalid or missing API key' });
      return;
    }
    next();
  };
}

export function createRestRouter(options: RestRouterOptions): Router {
  const router = Router();
  router.use(json());

  const adminGuard = options.adminApiKey ? requireApiKey(options.adminApiKey) : undefined;

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

  if (options.onRegisterAgent) {
    const registerHandler = async (req: Request, res: Response) => {
      const { id, name, url, description } = req.body as {
        id?: string;
        name?: string;
        url?: string;
        description?: string;
      };
      if (!id || !name || !url) {
        res.status(400).json({ error: 'Missing required fields: id, name, url' });
        return;
      }
      try {
        await options.onRegisterAgent!({ id, name, url, description });
        res.json({ ok: true, agentId: id });
      } catch (error) {
        res.status(500).json({ error: error instanceof Error ? error.message : 'Registration failed' });
      }
    };

    if (adminGuard) {
      router.post('/agents/register', adminGuard, registerHandler);
    } else {
      router.post('/agents/register', registerHandler);
    }
  }

  if (options.onUnregisterAgent) {
    const deleteHandler = async (req: Request, res: Response) => {
      const removed = await options.onUnregisterAgent!(req.params.id);
      if (!removed) {
        res.status(404).json({ error: `Agent not found: ${req.params.id}` });
        return;
      }
      res.json({ ok: true });
    };

    if (adminGuard) {
      router.delete('/agents/:id', adminGuard, deleteHandler);
    } else {
      router.delete('/agents/:id', deleteHandler);
    }
  }

  return router;
}

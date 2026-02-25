import { Router } from 'express';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  type TaskStore,
} from '@a2a-js/sdk/server';
import {
  jsonRpcHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express';
import type { AgentCard } from '@a2a-js/sdk';
import type { InvokeAgentFn } from '../types.ts';
import { GatewayExecutor } from './executor.ts';

export interface PerAgentGatewayOptions {
  /** Return the Agent Card for the given agentId (URL already rewritten) */
  getCard: (agentId: string) => AgentCard | undefined;
  /** Unified invoke via Orchestrator.invoke() */
  invokeAgent: InvokeAgentFn;
  taskStore?: TaskStore;
}

export interface PerAgentGateway {
  router: Router;
  /** Remove cached handler when an agent is unregistered */
  invalidate: (agentId: string) => void;
}

export function createPerAgentGateway(options: PerAgentGatewayOptions): PerAgentGateway {
  const { getCard, invokeAgent } = options;
  const taskStore = options.taskStore ?? new InMemoryTaskStore();

  // Lazy cache: agentId -> DefaultRequestHandler
  const handlers = new Map<string, DefaultRequestHandler>();

  function getOrCreateHandler(agentId: string): DefaultRequestHandler | undefined {
    if (handlers.has(agentId)) return handlers.get(agentId)!;
    const card = getCard(agentId);
    if (!card) return undefined;

    // Bind invokeAgent to this specific agentId
    const boundInvoke: InvokeAgentFn = (_agentId, contextId, text, history) =>
      invokeAgent(agentId, contextId, text, history);
    const executor = new GatewayExecutor(boundInvoke);
    const handler = new DefaultRequestHandler(card, taskStore, executor);
    handlers.set(agentId, handler);
    return handler;
  }

  const router = Router();

  // Per-agent Agent Card
  router.get('/agents/:agentId/.well-known/agent-card.json', (req, res) => {
    const { agentId } = req.params;
    const card = getCard(agentId);
    if (!card) {
      res.status(404).json({ error: `Agent not found: ${agentId}` });
      return;
    }
    res.json(card);
  });

  // Per-agent JSON-RPC (use router.use so jsonRpcHandler middleware sees correct req.path)
  router.use('/agents/:agentId/jsonrpc', (req, res, next) => {
    const { agentId } = req.params;
    const handler = getOrCreateHandler(agentId);
    if (!handler) {
      res.status(404).json({ error: `Agent not found: ${agentId}` });
      return;
    }
    jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication })(req, res, next);
  });

  return {
    router,
    invalidate: (agentId: string) => {
      handlers.delete(agentId);
    },
  };
}

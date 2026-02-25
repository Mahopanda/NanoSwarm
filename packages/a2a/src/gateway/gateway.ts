import { Router } from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
import type { AgentCard } from '@a2a-js/sdk';
import {
  InMemoryTaskStore,
  DefaultRequestHandler,
  type TaskStore,
} from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express';
import type { InvokeAgentFn } from '../types.ts';
import { GatewayExecutor } from './executor.ts';

export interface GatewayOptions {
  card: AgentCard;
  invokeAgent: InvokeAgentFn;
  taskStore?: TaskStore;
}

export function createGateway(options: GatewayOptions): Router {
  const { card, invokeAgent } = options;

  const taskStore: TaskStore = options.taskStore ?? new InMemoryTaskStore();
  const executor = new GatewayExecutor(invokeAgent);
  const requestHandler = new DefaultRequestHandler(card, taskStore, executor);

  const router = Router();

  // Agent Card endpoint
  router.use(
    `/${AGENT_CARD_PATH}`,
    agentCardHandler({ agentCardProvider: requestHandler }),
  );

  // JSON-RPC endpoint
  router.use(
    '/a2a/jsonrpc',
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }),
  );

  return router;
}

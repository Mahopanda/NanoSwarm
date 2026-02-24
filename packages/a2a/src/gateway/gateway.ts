import { Router } from 'express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';
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
import type { AgentRegistry } from '../registry.ts';
import { GatewayExecutor } from './executor.ts';

export interface GatewayOptions {
  registry: AgentRegistry;
  taskStore?: TaskStore;
}

export function createGateway(options: GatewayOptions): Router {
  const { registry } = options;

  const defaultEntry = registry.getDefault();
  if (!defaultEntry || !defaultEntry.card) {
    throw new Error('Cannot create gateway: no default agent registered');
  }

  const taskStore: TaskStore = options.taskStore ?? new InMemoryTaskStore();
  const executor = new GatewayExecutor(registry);
  const requestHandler = new DefaultRequestHandler(defaultEntry.card, taskStore, executor);

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

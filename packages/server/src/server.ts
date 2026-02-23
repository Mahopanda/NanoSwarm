import express, { type Express } from 'express';
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
import { Agent, type AgentConfig } from '@nanoswarm/core';
import { NanoSwarmExecutor } from './executor.ts';
import { buildAgentCard } from './agent-card.ts';
import type { ServerConfig } from './types.ts';

export interface NanoSwarmServer {
  app: Express;
  agent: Agent;
  start: (port?: number) => Promise<void>;
  stop: () => Promise<void>;
}

export async function createServer(config: ServerConfig): Promise<NanoSwarmServer> {
  const name = config.name ?? 'NanoSwarm';
  const version = config.version ?? '0.1.0';
  const port = config.port ?? 4000;
  const host = config.host ?? 'localhost';

  // 1. Create Agent
  const agentConfig: AgentConfig = {
    model: config.model,
    workspace: config.workspace,
    stores: config.stores,
    ...config.agentConfig,
  };
  const agent = new Agent(agentConfig);

  // 2. Start agent (loads skills)
  await agent.start();

  // 3. Build Agent Card from loaded skills
  const agentCard = buildAgentCard(config, agent.skills);

  // 4. Create TaskStore — prefer injected stores, else InMemoryTaskStore
  const taskStore: TaskStore = config.stores?.taskStore
    ? (config.stores.taskStore as TaskStore)
    : new InMemoryTaskStore();

  // 5. Create executor + request handler
  const executor = new NanoSwarmExecutor(agent);
  const requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);

  // 6. Build Express app
  const app = express();

  // Health endpoint
  const startTime = Date.now();
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      name,
      version,
      uptime: Math.floor((Date.now() - startTime) / 1000),
    });
  });

  // Agent Card endpoint
  app.use(
    `/${AGENT_CARD_PATH}`,
    agentCardHandler({ agentCardProvider: requestHandler }),
  );

  // JSON-RPC endpoint
  app.use(
    '/a2a/jsonrpc',
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }),
  );

  return {
    app,
    agent,
    start: (overridePort?: number) =>
      new Promise<void>((resolve) => {
        const p = overridePort ?? port;
        app.listen(p, host, () => {
          console.log(`[${name}] Server started on http://${host}:${p}`);
          console.log(`[${name}] Agent Card: http://${host}:${p}/${AGENT_CARD_PATH}`);
          console.log(`[${name}] JSON-RPC: http://${host}:${p}/a2a/jsonrpc`);
          console.log(`[${name}] Health: http://${host}:${p}/health`);
          resolve();
        });
      }),
    stop: async () => {
      await agent.stop();
    },
  };
}

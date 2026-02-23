import express, { type Express } from 'express';
import { Agent, type AgentConfig } from '@nanoswarm/core';
import { AgentRegistry, buildInternalCard, createGateway } from '@nanoswarm/a2a';
import { createRestRouter } from '@nanoswarm/channels';
import { Orchestrator } from '@nanoswarm/orchestrator';
import type { ServerConfig } from './types.ts';

export interface NanoSwarmServer {
  app: Express;
  agent: Agent;
  agents: Agent[];
  start: (port?: number) => Promise<void>;
  stop: () => Promise<void>;
}

export async function createServer(config: ServerConfig): Promise<NanoSwarmServer> {
  const name = config.name ?? 'NanoSwarm';
  const version = config.version ?? '0.1.0';
  const port = config.port ?? 4000;
  const host = config.host ?? 'localhost';

  const registry = new AgentRegistry();
  const orchestrator = new Orchestrator();
  const agents: Agent[] = [];

  if (config.agents && config.agents.length > 0) {
    // Multi-agent mode
    for (const def of config.agents) {
      const agentConfig: AgentConfig = {
        model: def.model ?? config.model,
        workspace: def.workspace ?? config.workspace,
        stores: config.stores,
        ...def.agentConfig,
      };
      const agent = new Agent(agentConfig);
      await agent.start();
      agents.push(agent);

      const url = `http://${host}:${port}/a2a/jsonrpc`;
      const card = buildInternalCard(
        { name: def.name, description: def.description ?? `Agent: ${def.name}`, version, url },
        agent.skills,
      );
      registry.register({ id: def.id, card, handler: agent }, { default: def.default });

      orchestrator.registerAgent(
        {
          id: def.id,
          name: def.name,
          handle: async (contextId, text, history) => {
            const result = await agent.chat(contextId, text, history);
            return { text: result.text };
          },
        },
        { default: def.default },
      );
    }
  } else {
    // Single-agent mode (backward compatible)
    const agentConfig: AgentConfig = {
      model: config.model,
      workspace: config.workspace,
      stores: config.stores,
      ...config.agentConfig,
    };
    const agent = new Agent(agentConfig);
    await agent.start();
    agents.push(agent);

    const url = `http://${host}:${port}/a2a/jsonrpc`;
    const card = buildInternalCard(
      { name, description: config.description ?? 'A NanoSwarm agent', version, url },
      agent.skills,
    );
    registry.register({ id: 'default', card, handler: agent });

    orchestrator.registerAgent({
      id: 'default',
      name,
      handle: async (contextId, text, history) => {
        const result = await agent.chat(contextId, text, history);
        return { text: result.text };
      },
    });
  }

  // Express app
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

  // REST Channel (with listAgents callback)
  app.use('/api', createRestRouter({
    handler: orchestrator,
    listAgents: () => orchestrator.listAgents(),
  }));

  // A2A Gateway
  const taskStore = config.stores?.taskStore
    ? (config.stores.taskStore as import('@nanoswarm/a2a').TaskStore)
    : undefined;
  app.use(createGateway({ registry, taskStore }));

  return {
    app,
    agent: agents[0],
    agents,
    start: (overridePort?: number) =>
      new Promise<void>((resolve) => {
        const p = overridePort ?? port;
        app.listen(p, host, () => {
          console.log(`[${name}] Server started on http://${host}:${p}`);
          console.log(`[${name}] REST API: http://${host}:${p}/api/chat`);
          console.log(`[${name}] Agent Card: http://${host}:${p}/.well-known/agent-card.json`);
          console.log(`[${name}] JSON-RPC: http://${host}:${p}/a2a/jsonrpc`);
          console.log(`[${name}] Health: http://${host}:${p}/health`);
          resolve();
        });
      }),
    stop: async () => {
      await Promise.all(agents.map(a => a.stop()));
    },
  };
}

// CLI entry point
if (import.meta.main) {
  const { resolve } = await import('node:path');
  const { loadConfig, resolveModel, resolveWorkspace } = await import('./config.ts');

  const config = await loadConfig();
  const model = resolveModel(config);

  const workspace = process.env.WORKSPACE
    ? resolve(process.env.WORKSPACE)
    : await resolveWorkspace(config);

  const server = await createServer({
    name: config.server?.name ?? 'NanoSwarm',
    port: config.server?.port ?? (Number(process.env.PORT) || 4000),
    host: config.server?.host ?? 'localhost',
    model,
    workspace,
  });

  await server.start();

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      console.log(`\n[NanoSwarm] Shutting down...`);
      await server.stop();
      process.exit(0);
    });
  }
}

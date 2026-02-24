import express, { type Express } from 'express';
import { Agent, type AgentConfig, createInvokeAgentTool, type AgentResolver } from '@nanoswarm/core';
import { AgentRegistry, buildInternalCard, createGateway, connectExternalAgent } from '@nanoswarm/a2a';
import {
  createRestRouter,
  MessageBus,
  ChannelManager,
  CLIChannel,
  TelegramChannel,
  sessionKey,
  type InboundMessage,
  type NormalizedMessage,
} from '@nanoswarm/channels';
import { Orchestrator } from '@nanoswarm/orchestrator';
import type { ServerConfig } from './types.ts';

export interface NanoSwarmServer {
  app: Express;
  agent: Agent;
  agents: Agent[];
  bus?: MessageBus;
  channelManager?: ChannelManager;
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
          handle: async (contextId, text, history, opts) => {
            const result = await agent.chat(contextId, text, history, opts);
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
      handle: async (contextId, text, history, opts) => {
        const result = await agent.chat(contextId, text, history, opts);
        return { text: result.text };
      },
    });
  }

  // External agents (optional)
  if (config.externalAgents) {
    for (const ext of config.externalAgents) {
      const entry = connectExternalAgent(ext);
      registry.register(entry);
      orchestrator.registerAgent({
        id: ext.id,
        name: ext.name,
        handle: async (contextId, text) => entry.handler.chat(contextId, text),
      });
    }
  }

  // AgentResolver — lets any agent invoke other agents via invoke_agent tool
  const agentResolver: AgentResolver = {
    list: () =>
      registry.list().map((e) => ({
        id: e.id,
        name: 'name' in e ? e.name : e.id,
        description: 'card' in e && e.card ? e.card.description : undefined,
      })),
    invoke: async (agentId, contextId, text) => {
      const entry = registry.get(agentId);
      if (!entry) throw new Error(`Agent not found: ${agentId}`);
      return entry.handler.chat(contextId, text);
    },
  };

  // Register invoke_agent tool on all internal agents
  const invokeAgentTool = createInvokeAgentTool(agentResolver);
  for (const agent of agents) {
    agent.registry.register(invokeAgentTool);
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

  // Channel layer (optional — only when config.channels is present)
  let bus: MessageBus | undefined;
  let channelManager: ChannelManager | undefined;

  if (config.channels) {
    bus = new MessageBus();
    channelManager = new ChannelManager(bus);

    // Register enabled channels
    if (config.channels.cli?.enabled) {
      channelManager.register(new CLIChannel(config.channels.cli, bus));
    }
    if (config.channels.telegram?.enabled) {
      const telegramChannel = new TelegramChannel(config.channels.telegram, bus);

      // Wire AdminProvider from primary agent
      const primaryAgent = agents[0];
      telegramChannel.setAdminProvider({
        getStatus: () => primaryAgent.getStatus(),
        getRunningTasks: () => primaryAgent.getRunningTasks(),
        cancelTask: (id) => primaryAgent.cancelTask(id),
        getRecentLogs: (count, filter) => primaryAgent.getRecentLogs(count, filter),
      });

      channelManager.register(telegramChannel);
    }

    // Inbound consumer loop: bus → orchestrator → bus.outbound
    const consumeInbound = async () => {
      while (true) {
        const inMsg: InboundMessage = await bus!.consumeInbound();
        const conversationId = sessionKey(inMsg);

        const normalized: NormalizedMessage = {
          channelId: inMsg.channel,
          userId: inMsg.senderId,
          conversationId,
          text: inMsg.content,
          metadata: { ...inMsg.metadata, chatId: inMsg.chatId },
        };

        try {
          const response = await orchestrator.handle(normalized);
          bus!.publishOutbound({
            channel: inMsg.channel,
            chatId: inMsg.chatId,
            content: response.text,
            media: [],
            metadata: response.metadata ?? {},
          });
        } catch (err) {
          console.error(`[${name}] Channel message error:`, err);
          bus!.publishOutbound({
            channel: inMsg.channel,
            chatId: inMsg.chatId,
            content: 'An error occurred while processing your message.',
            media: [],
            metadata: {},
          });
        }
      }
    };
    // Fire-and-forget — runs until process exits
    consumeInbound();

    // Wire agent cron-deliver events to MessageBus outbound
    for (const agent of agents) {
      agent.eventBus.on('cron-deliver', (data: { channel: string; chatId: string; content: string }) => {
        bus!.publishOutbound({
          channel: data.channel,
          chatId: data.chatId,
          content: data.content,
          media: [],
          metadata: {},
        });
      });
    }
  }

  return {
    app,
    agent: agents[0],
    agents,
    bus,
    channelManager,
    start: async (overridePort?: number) => {
      const p = overridePort ?? port;
      await new Promise<void>((resolve) => {
        app.listen(p, host, () => {
          console.log(`[${name}] Server started on http://${host}:${p}`);
          console.log(`[${name}] REST API: http://${host}:${p}/api/chat`);
          console.log(`[${name}] Agent Card: http://${host}:${p}/.well-known/agent-card.json`);
          console.log(`[${name}] JSON-RPC: http://${host}:${p}/a2a/jsonrpc`);
          console.log(`[${name}] Health: http://${host}:${p}/health`);
          resolve();
        });
      });
      if (channelManager) {
        await channelManager.startAll();
        console.log(`[${name}] Channels started:`, Object.keys(channelManager.getStatus()).join(', '));
      }
    },
    stop: async () => {
      if (channelManager) {
        await channelManager.stopAll();
      }
      await Promise.all(agents.map(a => a.stop()));
    },
  };
}

// CLI entry point moved to @nanoswarm/cli gateway command

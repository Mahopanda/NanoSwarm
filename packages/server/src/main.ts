import express, { type Express } from 'express';
import { Agent, type AgentConfig, createInvokeAgentTool, type AgentResolver } from '@nanoswarm/core';
import { AgentRegistry, buildInternalCard, createGateway, createPerAgentGateway, connectExternalAgent } from '@nanoswarm/a2a';
import type { AgentEntry } from '@nanoswarm/a2a';
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
import type { AgentStore, ResolvedAgent } from '@nanoswarm/orchestrator';
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

// Adapter: AgentEntry → ResolvedAgent
function toResolvedAgent(entry: AgentEntry): ResolvedAgent {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    handle: async (contextId, text, history, opts) =>
      entry.handler.chat(contextId, text, history, opts),
  };
}

export async function createServer(config: ServerConfig): Promise<NanoSwarmServer> {
  const name = config.name ?? 'NanoSwarm';
  const version = config.version ?? '0.1.0';
  const port = config.port ?? 4000;
  const host = config.host ?? 'localhost';

  const registry = new AgentRegistry();
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
      registry.register(
        { id: def.id, name: def.name, description: def.description, kind: 'internal', card, handler: agent },
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
    registry.register({
      id: 'default',
      name,
      description: config.description ?? 'A NanoSwarm agent',
      kind: 'internal',
      card,
      handler: agent,
    });
  }

  // External agents (optional)
  if (config.externalAgents) {
    for (const ext of config.externalAgents) {
      const entry = await connectExternalAgent(ext);
      registry.register(entry);

      if (entry.card) {
        console.log(`[${name}] External agent "${ext.id}" connected: ${ext.url} (${entry.card.name})`);
      } else {
        console.warn(`[${name}] External agent "${ext.id}" registered but card unavailable: ${ext.url}`);
      }
    }
  }

  // Adapter: AgentRegistry → AgentStore
  const agentStore: AgentStore = {
    get: (id) => { const e = registry.get(id); return e ? toResolvedAgent(e) : undefined; },
    getDefault: () => { const e = registry.getDefault(); return e ? toResolvedAgent(e) : undefined; },
    list: () => registry.list().map(e => ({ id: e.id, name: e.name, description: e.description })),
    has: (id) => registry.has(id),
  };

  const orchestrator = new Orchestrator(agentStore);

  // AgentResolver — lets any agent invoke other agents via invoke_agent tool
  const agentResolver: AgentResolver = {
    list: () => registry.list().map(e => ({ id: e.id, name: e.name, description: e.description })),
    invoke: async (agentId, contextId, text) => {
      const result = await orchestrator.invoke(agentId, contextId, text);
      return { text: result.text };
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

  // A2A Gateway (global — default agent)
  const defaultEntry = registry.getDefault();
  if (!defaultEntry || !defaultEntry.card) {
    throw new Error('Cannot create gateway: no default agent with card');
  }
  const taskStore = config.stores?.taskStore
    ? (config.stores.taskStore as import('@nanoswarm/a2a').TaskStore)
    : undefined;
  app.use(createGateway({
    card: defaultEntry.card,
    invokeAgent: (agentId, contextId, text, history) =>
      orchestrator.invoke(agentId, contextId, text, history),
    taskStore,
  }));

  // Per-Agent A2A Gateway
  const getAgentCard = (agentId: string) => {
    const entry = registry.get(agentId);
    if (!entry?.card) return undefined;
    return {
      ...entry.card,
      url: `http://${host}:${port}/a2a/agents/${agentId}/jsonrpc`,
    };
  };

  const perAgentGW = createPerAgentGateway({
    getCard: getAgentCard,
    invokeAgent: (agentId, contextId, text, history) =>
      orchestrator.invoke(agentId, contextId, text, history),
    taskStore,
  });
  app.use('/a2a', perAgentGW.router);

  // REST Channel (with listAgents + dynamic register/unregister)
  app.use('/api', createRestRouter({
    handler: orchestrator,
    adminApiKey: config.adminApiKey,
    listAgents: () => registry.list().map(e => ({ id: e.id, name: e.name, description: e.description })),
    onRegisterAgent: async ({ id, name: agentName, url, description }) => {
      if (registry.has(id)) {
        throw new Error(`Agent already exists: ${id}`);
      }
      const entry = await connectExternalAgent({ id, name: agentName, url, description });
      registry.register(entry);
    },
    onUnregisterAgent: async (id) => {
      const removed = registry.unregister(id);
      if (removed) {
        perAgentGW.invalidate(id);
      }
      return removed;
    },
  }));

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

    // Sub-bots: each account under telegram.accounts gets its own TelegramChannel
    const accounts = config.channels.telegram?.accounts;
    if (accounts) {
      for (const [botId, account] of Object.entries(accounts)) {
        const subBot = new TelegramChannel({
          enabled: true,
          token: account.token,
          botId,
          boundAgent: account.boundAgent,
          allowFrom: account.allowFrom,
          proxy: account.proxy,
          replyToMessage: account.replyToMessage,
          sttProvider: account.sttProvider,
          sttApiKey: account.sttApiKey,
          group: account.group,
          mediaDir: account.mediaDir,
        }, bus);
        channelManager.register(subBot);
      }
    }

    // Inbound consumer loop: bus → orchestrator → bus.outbound
    const consumeInbound = async () => {
      while (true) {
        const inMsg: InboundMessage = await bus!.consumeInbound();
        const conversationId = sessionKey(inMsg);
        const t0 = Date.now();
        console.log(`[${name}] ← ${inMsg.channel} (${inMsg.senderId}) "${inMsg.content.slice(0, 80)}"`);

        const normalized: NormalizedMessage = {
          channelId: inMsg.channel,
          userId: inMsg.senderId,
          conversationId,
          text: inMsg.content,
          metadata: { ...inMsg.metadata, chatId: inMsg.chatId },
        };

        try {
          const response = await orchestrator.handle(normalized);
          const ms = Date.now() - t0;
          console.log(`[${name}] → ${inMsg.channel} (${ms}ms) "${response.text.slice(0, 80)}"`);
          bus!.publishOutbound({
            channel: inMsg.channel,
            chatId: inMsg.chatId,
            content: response.text,
            replyTo: inMsg.metadata['messageId'] != null ? String(inMsg.metadata['messageId']) : undefined,
            media: [],
            metadata: response.metadata ?? {},
          });
        } catch (err) {
          console.error(`[${name}] Channel message error (${Date.now() - t0}ms):`, err);
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
          console.log(`[${name}] Per-Agent A2A: http://${host}:${p}/a2a/agents/:id/jsonrpc`);
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

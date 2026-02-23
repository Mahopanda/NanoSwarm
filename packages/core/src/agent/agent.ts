import { join } from 'node:path';
import type { LanguageModel } from 'ai';
import { EventBus } from '../events/event-bus.ts';
import { FileMemoryStore } from '../memory/memory-store.ts';
import type { MemoryStore } from '../memory/memory-store.ts';
import { FileHistoryStore } from '../memory/history-store.ts';
import type { HistoryStore } from '../memory/history-store.ts';
import type { Stores } from '../store/types.ts';
import { MemoryConsolidator } from '../memory/consolidator.ts';
import { SkillLoader } from '../skills/loader.ts';
import { ContextBuilder } from '../context/context-builder.ts';
import { ToolRegistry } from '../tools/registry.ts';
import { registerDefaultTools } from '../tools/factory.ts';
import { AgentLoop } from './loop.ts';
import { SubagentManager } from './subagent-manager.ts';
import { CronService } from '../cron/service.ts';
import { HeartbeatService } from '../heartbeat/service.ts';
import type { AgentLoopConfig, AgentLoopResult } from './types.ts';
import type { ExecToolOptions } from '../tools/shell.ts';
import type { MCPServerConfig, MCPConnection } from '../mcp/types.ts';
import { connectMCPServers, disconnectMCPServers } from '../mcp/client.ts';

export interface AgentConfig {
  model: LanguageModel;
  workspace: string;
  stores?: Stores;
  skillsDir?: string;
  cronStoreDir?: string;
  heartbeatEnabled?: boolean;
  cronEnabled?: boolean;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  execOptions?: ExecToolOptions;
  mcpServers?: Record<string, MCPServerConfig>;
}

export class Agent {
  readonly eventBus: EventBus;
  readonly registry: ToolRegistry;
  readonly memoryStore: MemoryStore;
  readonly historyStore: HistoryStore;

  private stores: Stores | null;

  private _skillLoader: SkillLoader;
  private contextBuilder: ContextBuilder;

  get skills() {
    return this._skillLoader.allSkills;
  }
  private loop: AgentLoop;
  private subagentManager: SubagentManager;
  private cronService: CronService | null;
  private heartbeatService: HeartbeatService | null;
  private consolidator: MemoryConsolidator;
  private config: AgentConfig;
  private mcpConnections: MCPConnection[] = [];

  constructor(config: AgentConfig) {
    this.config = config;

    // 1. EventBus
    this.eventBus = new EventBus();

    // 2. Memory & History stores (use injected stores or fallback to file-based)
    this.stores = config.stores ?? null;
    this.memoryStore = config.stores?.memoryStore ?? new FileMemoryStore(config.workspace);
    this.historyStore = config.stores?.historyStore ?? new FileHistoryStore(config.workspace);

    // 3. SkillLoader
    this._skillLoader = new SkillLoader();

    // 4. ContextBuilder
    this.contextBuilder = new ContextBuilder(
      config.workspace,
      this._skillLoader,
      this.memoryStore,
    );

    // 5. ToolRegistry
    this.registry = new ToolRegistry();

    // 6. AgentLoopConfig
    const loopConfig: AgentLoopConfig = {
      model: config.model,
      maxIterations: config.maxIterations,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    };

    // 7. SubagentManager
    this.subagentManager = new SubagentManager(
      loopConfig,
      this.contextBuilder,
      this.registry,
      this.eventBus,
    );

    // 8. CronService (optional)
    const cronEnabled = config.cronEnabled ?? true;
    if (cronEnabled) {
      const cronStoreDir = config.cronStoreDir ?? join(config.workspace, '.nanoswarm');
      this.cronService = new CronService(cronStoreDir, async (job) => {
        // Direct deliver: send message as-is without agent processing
        if (job.payload.kind === 'direct_deliver') {
          if (job.payload.deliver && job.payload.to) {
            this.eventBus.emit('cron-deliver', {
              channel: job.payload.channel ?? 'cli',
              chatId: job.payload.to,
              content: job.payload.message,
            });
          }
          return job.payload.message;
        }

        // Agent turn: process through agent loop
        const result = await this.loop.run(`cron:${job.id}`, job.payload.message);

        if (job.payload.deliver && job.payload.to) {
          this.eventBus.emit('cron-deliver', {
            channel: job.payload.channel ?? 'cli',
            chatId: job.payload.to,
            content: result.text,
          });
        }

        return result.text;
      });
    } else {
      this.cronService = null;
    }

    // 9. Register default tools
    registerDefaultTools(this.registry, {
      eventBus: this.eventBus,
      subagentManager: this.subagentManager,
      cronService: this.cronService ?? undefined,
      execOptions: config.execOptions,
    });

    // 10. AgentLoop
    this.loop = new AgentLoop(loopConfig, this.contextBuilder, this.registry, this.eventBus);

    // 11. HeartbeatService (optional)
    const heartbeatEnabled = config.heartbeatEnabled ?? true;
    if (heartbeatEnabled) {
      this.heartbeatService = new HeartbeatService(config.workspace, async (prompt) => {
        const result = await this.loop.run('heartbeat', prompt);
        return result.text;
      });
    } else {
      this.heartbeatService = null;
    }

    // 12. MemoryConsolidator
    this.consolidator = new MemoryConsolidator(
      config.model,
      this.memoryStore,
      this.historyStore,
    );
  }

  async start(): Promise<void> {
    // Load skills
    const skillsDir = this.config.skillsDir ?? join(this.config.workspace, '.nanoswarm', 'skills');
    await this._skillLoader.loadAll(skillsDir);

    // Connect MCP servers
    if (this.config.mcpServers && Object.keys(this.config.mcpServers).length > 0) {
      this.mcpConnections = await connectMCPServers(this.config.mcpServers, this.registry);
    }

    // Start CronService
    if (this.cronService) {
      await this.cronService.start();
    }

    // Start HeartbeatService
    if (this.heartbeatService) {
      this.heartbeatService.start();
    }
  }

  async stop(): Promise<void> {
    if (this.mcpConnections.length > 0) {
      await disconnectMCPServers(this.mcpConnections, this.registry);
      this.mcpConnections = [];
    }
    if (this.cronService) {
      this.cronService.stop();
    }
    if (this.heartbeatService) {
      this.heartbeatService.stop();
    }
    this.stores?.close();
  }

  async chat(
    contextId: string,
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
    opts?: { channel?: string; chatId?: string },
  ): Promise<AgentLoopResult> {
    // Handle /new command
    if (message.trim() === '/new') {
      if (history && history.length > 0) {
        await this.resetSession(
          contextId,
          history.map((m) => ({ role: m.role, content: m.content })),
        );
      }
      return {
        text: 'Session cleared. Memory consolidated.',
        toolCalls: [],
        steps: 0,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        finishReason: 'command',
      };
    }

    return this.loop.run(contextId, message, history, opts);
  }

  async resetSession(
    contextId: string,
    messages: Array<{ role: string; content: string; timestamp?: string }>,
  ): Promise<void> {
    await this.consolidator.consolidate(contextId, messages, { archiveAll: true });
  }
}

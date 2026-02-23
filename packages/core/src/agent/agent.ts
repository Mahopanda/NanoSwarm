import { join } from 'node:path';
import type { LanguageModel } from 'ai';
import { EventBus } from '../events/event-bus.ts';
import { FileMemoryStore } from '../memory/memory-store.ts';
import { FileHistoryStore } from '../memory/history-store.ts';
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

export interface AgentConfig {
  model: LanguageModel;
  workspace: string;
  skillsDir?: string;
  cronStoreDir?: string;
  heartbeatEnabled?: boolean;
  cronEnabled?: boolean;
  maxIterations?: number;
  temperature?: number;
  maxTokens?: number;
  execOptions?: ExecToolOptions;
}

export class Agent {
  readonly eventBus: EventBus;
  readonly registry: ToolRegistry;
  readonly memoryStore: FileMemoryStore;
  readonly historyStore: FileHistoryStore;

  private skillLoader: SkillLoader;
  private contextBuilder: ContextBuilder;
  private loop: AgentLoop;
  private subagentManager: SubagentManager;
  private cronService: CronService | null;
  private heartbeatService: HeartbeatService | null;
  private consolidator: MemoryConsolidator;
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;

    // 1. EventBus
    this.eventBus = new EventBus();

    // 2. Memory & History stores
    this.memoryStore = new FileMemoryStore(config.workspace);
    this.historyStore = new FileHistoryStore(config.workspace);

    // 3. SkillLoader
    this.skillLoader = new SkillLoader();

    // 4. ContextBuilder
    this.contextBuilder = new ContextBuilder(
      config.workspace,
      this.skillLoader,
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
        const result = await this.loop.run('cron', job.payload.message);
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
    await this.skillLoader.loadAll(skillsDir);

    // Start CronService
    if (this.cronService) {
      await this.cronService.start();
    }

    // Start HeartbeatService
    if (this.heartbeatService) {
      this.heartbeatService.start();
    }
  }

  stop(): void {
    if (this.cronService) {
      this.cronService.stop();
    }
    if (this.heartbeatService) {
      this.heartbeatService.stop();
    }
  }

  async chat(
    contextId: string,
    message: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
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

    return this.loop.run(contextId, message, history);
  }

  async resetSession(
    contextId: string,
    messages: Array<{ role: string; content: string; timestamp?: string }>,
  ): Promise<void> {
    await this.consolidator.consolidate(contextId, messages, { archiveAll: true });
  }
}

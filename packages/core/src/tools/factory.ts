import type { EventBus } from '../events/event-bus.ts';
import type { SubagentManager } from '../agent/subagent-manager.ts';
import type { CronService } from '../cron/service.ts';
import type { ToolRegistry } from './registry.ts';
import type { ExecToolOptions } from './shell.ts';
import { createReadFileTool, createWriteFileTool, createEditFileTool, createListDirTool } from './filesystem.ts';
import { createExecTool } from './shell.ts';
import { createWebSearchTool, createWebFetchTool } from './web.ts';
import { createMessageTool } from './message.ts';
import { createSpawnTool } from './spawn.ts';
import { createCronTool } from './cron.ts';

export interface ToolFactoryConfig {
  eventBus: EventBus;
  subagentManager?: SubagentManager;
  cronService?: CronService;
  execOptions?: ExecToolOptions;
}

export function registerDefaultTools(
  registry: ToolRegistry,
  config: ToolFactoryConfig,
): void {
  // File tools (4)
  registry.register(createReadFileTool());
  registry.register(createWriteFileTool());
  registry.register(createEditFileTool());
  registry.register(createListDirTool());

  // Shell (1)
  registry.register(createExecTool(config.execOptions));

  // Web (2)
  registry.register(createWebSearchTool());
  registry.register(createWebFetchTool());

  // Message (1)
  registry.register(createMessageTool(config.eventBus));

  // Spawn — only when SubagentManager is available
  if (config.subagentManager) {
    registry.register(createSpawnTool(config.subagentManager));
  }

  // Cron — only when CronService is available
  if (config.cronService) {
    registry.register(createCronTool(config.cronService));
  }
}

import { z } from 'zod';
import type { NanoTool } from './base.ts';
import type { SubagentManager } from '../agent/subagent-manager.ts';

export function createSpawnTool(manager: SubagentManager): NanoTool {
  return {
    name: 'spawn',
    description:
      'Spawn a background subagent to handle a task independently. The subagent runs with restricted tools (no message, spawn, or cron).',
    parameters: z.object({
      task: z.string().describe('The task description for the subagent to execute'),
      label: z.string().optional().describe('Optional human-readable label for tracking'),
    }),
    execute: async (params, context) => {
      return manager.spawn(params.task, params.label, context.contextId);
    },
  };
}

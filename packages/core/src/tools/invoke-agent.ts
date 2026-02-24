import { z } from 'zod';
import type { NanoTool } from './base.ts';

export interface AgentResolver {
  list(): Array<{ id: string; name: string; description?: string }>;
  invoke(agentId: string, contextId: string, text: string): Promise<{ text: string }>;
}

export function createInvokeAgentTool(resolver: AgentResolver): NanoTool {
  return {
    name: 'invoke_agent',
    description:
      'Invoke another agent by ID to delegate a task. Use action "list" to discover available agents, then "invoke" to call one.',
    parameters: z.object({
      action: z.enum(['list', 'invoke']),
      agentId: z.string().optional().describe('The ID of the agent to invoke'),
      task: z.string().optional().describe('The task description to send to the agent'),
    }),
    execute: async (params, context) => {
      if (params.action === 'list') {
        return JSON.stringify(resolver.list());
      }
      if (!params.agentId || !params.task) {
        return 'Error: agentId and task are required for invoke action';
      }
      const result = await resolver.invoke(params.agentId, context.contextId, params.task);
      return result.text;
    },
  };
}

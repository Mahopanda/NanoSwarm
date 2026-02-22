import { tool } from 'ai';
import type { z } from 'zod';

export interface ToolContext {
  workspace: string;
  contextId: string;
  allowedDir?: string;
}

export interface NanoTool {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (params: any, context: ToolContext) => Promise<string>;
}

export function toAITool(nanoTool: NanoTool, context: ToolContext) {
  return tool({
    description: nanoTool.description,
    inputSchema: nanoTool.parameters,
    execute: async (params) => nanoTool.execute(params, context),
  });
}

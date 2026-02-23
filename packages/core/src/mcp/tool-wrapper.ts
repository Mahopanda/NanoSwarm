import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { NanoTool, ToolContext } from '../tools/base.ts';
import type { MCPToolDefinition } from './types.ts';
import { jsonSchemaToZod } from './json-schema-to-zod.ts';
import type { z } from 'zod';

export class MCPToolWrapper implements NanoTool {
  readonly name: string;
  readonly description: string;
  readonly parameters: z.ZodObject<any>;

  private client: Client;
  private originalName: string;

  constructor(serverName: string, toolDef: MCPToolDefinition, client: Client) {
    this.originalName = toolDef.name;
    this.name = `mcp_${serverName}_${toolDef.name}`;
    this.description = toolDef.description ?? `MCP tool: ${toolDef.name}`;
    this.parameters = jsonSchemaToZod(toolDef.inputSchema) as z.ZodObject<any>;
    this.client = client;
  }

  async execute(params: Record<string, unknown>, _context: ToolContext): Promise<string> {
    try {
      const result = await this.client.callTool({
        name: this.originalName,
        arguments: params,
      });

      if (!result.content || !Array.isArray(result.content)) {
        return '';
      }

      const parts: string[] = [];
      for (const block of result.content as Array<Record<string, unknown>>) {
        if (block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text);
        } else {
          parts.push(JSON.stringify(block));
        }
      }
      return parts.join('\n');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return `[MCP Error] ${this.originalName}: ${msg}`;
    }
  }
}

import type { NanoTool, ToolContext } from './base.ts';
import { toAITool } from './base.ts';

export class ToolRegistry {
  private tools = new Map<string, NanoTool>();

  register(tool: NanoTool): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): NanoTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  getAITools(context: ToolContext): Record<string, ReturnType<typeof toAITool>> {
    const result: Record<string, ReturnType<typeof toAITool>> = {};
    for (const [name, nanoTool] of this.tools) {
      result[name] = toAITool(nanoTool, context);
    }
    return result;
  }

  get toolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  get size(): number {
    return this.tools.size;
  }
}

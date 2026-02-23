import type { AgentRegistry } from './registry.ts';
import type { AgentHandler } from './types.ts';

export class A2ARouter {
  constructor(private registry: AgentRegistry) {}

  resolve(agentId?: string): AgentHandler {
    if (agentId) {
      const entry = this.registry.get(agentId);
      if (!entry) {
        throw new Error(`Agent not found: ${agentId}`);
      }
      return entry.handler;
    }

    const defaultEntry = this.registry.getDefault();
    if (!defaultEntry) {
      throw new Error('No default agent registered');
    }
    return defaultEntry.handler;
  }
}

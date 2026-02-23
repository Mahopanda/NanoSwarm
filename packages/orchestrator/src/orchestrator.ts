import type { MessageHandler, NormalizedMessage, NormalizedResponse } from '@nanoswarm/channels';
import type { AgentHandle } from './types.ts';
import { TaskManager } from './task-manager.ts';

export class Orchestrator implements MessageHandler {
  private agents = new Map<string, AgentHandle>();
  private defaultAgentId: string | null = null;
  private taskManager = new TaskManager();

  registerAgent(agent: AgentHandle, opts?: { default?: boolean }): void {
    this.agents.set(agent.id, agent);
    if (opts?.default || this.agents.size === 1) {
      this.defaultAgentId = agent.id;
    }
  }

  getAgent(id: string): AgentHandle | undefined {
    return this.agents.get(id);
  }

  getDefaultAgent(): AgentHandle | undefined {
    return this.defaultAgentId ? this.agents.get(this.defaultAgentId) : undefined;
  }

  getTaskManager(): TaskManager {
    return this.taskManager;
  }

  async handle(message: NormalizedMessage): Promise<NormalizedResponse> {
    const agent = this.getDefaultAgent();
    if (!agent) {
      throw new Error('No agent registered');
    }

    const task = this.taskManager.create(message.conversationId, agent.id);
    this.taskManager.updateState(task.id, 'working');

    try {
      const result = await agent.handle(message.conversationId, message.text);
      this.taskManager.updateState(task.id, 'completed');
      return {
        text: result.text,
        metadata: result.metadata,
      };
    } catch (error) {
      this.taskManager.updateState(task.id, 'failed');
      throw error;
    }
  }
}

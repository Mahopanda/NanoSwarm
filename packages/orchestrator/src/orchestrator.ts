import type { MessageHandler, NormalizedMessage, NormalizedResponse } from '@nanoswarm/channels';
import type { AgentHandle, AgentResult, ChatHistory } from './types.ts';
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

  listAgents(): Array<{ id: string; name: string; description?: string }> {
    return [...this.agents.values()].map(a => ({
      id: a.id,
      name: a.name,
      ...(a.description ? { description: a.description } : {}),
    }));
  }

  async invoke(
    agentId: string | undefined,
    contextId: string,
    text: string,
    history?: ChatHistory,
    opts?: { channel?: string; chatId?: string },
  ): Promise<AgentResult> {
    const agent = this.resolveAgentById(agentId);
    const task = this.taskManager.create(contextId, agent.id);
    this.taskManager.updateState(task.id, 'working');

    try {
      const result = await agent.handle(contextId, text, history, opts);
      this.taskManager.updateState(task.id, 'completed');
      return { text: result.text, metadata: { ...result.metadata, agentId: agent.id } };
    } catch (error) {
      this.taskManager.updateState(task.id, 'failed');
      throw error;
    }
  }

  async handle(message: NormalizedMessage): Promise<NormalizedResponse> {
    const agentId = message.metadata?.agentId as string | undefined;
    const result = await this.invoke(agentId, message.conversationId, message.text, undefined, {
      channel: message.channelId,
      chatId: message.metadata?.chatId as string | undefined,
    });
    return { text: result.text, metadata: result.metadata };
  }

  private resolveAgentById(agentId: string | undefined): AgentHandle {
    if (agentId) {
      const agent = this.agents.get(agentId);
      if (!agent) throw new Error(`Agent not found: ${agentId}`);
      return agent;
    }
    const defaultAgent = this.getDefaultAgent();
    if (!defaultAgent) throw new Error('No agent registered');
    return defaultAgent;
  }
}

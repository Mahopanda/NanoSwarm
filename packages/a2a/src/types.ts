import type { AgentCard, AgentSkill } from '@a2a-js/sdk';

export type { AgentCard, AgentSkill };
export type { Task, Message, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '@a2a-js/sdk';
export type { AgentExecutor, RequestContext, ExecutionEventBus, TaskStore } from '@a2a-js/sdk/server';

export interface AgentHandler {
  chat(
    contextId: string,
    text: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<{ text: string }>;
}

export interface InternalAgentEntry {
  id: string;
  card: AgentCard;
  handler: AgentHandler;
}

export interface ExternalCardConfig {
  baseUrl: string;
  skillFilter?: (skill: AgentSkill) => boolean;
}

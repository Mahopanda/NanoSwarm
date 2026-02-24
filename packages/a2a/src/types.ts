import type { AgentCard, AgentSkill } from '@a2a-js/sdk';

export type { AgentCard, AgentSkill };
export type { Task, Message, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '@a2a-js/sdk';
export type { AgentExecutor, RequestContext, ExecutionEventBus, TaskStore } from '@a2a-js/sdk/server';

export interface AgentHandler {
  chat(
    contextId: string,
    text: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
    opts?: { channel?: string; chatId?: string },
  ): Promise<{ text: string }>;
}

export interface AgentEntry {
  id: string;
  name: string;
  description?: string;
  kind: 'internal' | 'external';
  card?: AgentCard;
  url?: string;
  handler: AgentHandler;
}

export function isExternalEntry(entry: AgentEntry): boolean {
  return entry.kind === 'external';
}

export interface ExternalCardConfig {
  baseUrl: string;
  skillFilter?: (skill: AgentSkill) => boolean;
}

export type InvokeAgentFn = (
  agentId: string | undefined,
  contextId: string,
  text: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
) => Promise<{ text: string }>;

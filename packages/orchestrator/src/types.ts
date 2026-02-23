export interface AgentResult {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface AgentHandle {
  id: string;
  name: string;
  handle(
    contextId: string,
    text: string,
    history?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<AgentResult>;
}

export type TaskState = 'pending' | 'working' | 'completed' | 'failed';

export interface TaskRecord {
  id: string;
  contextId: string;
  agentId: string;
  state: TaskState;
  createdAt: string;
  updatedAt: string;
}

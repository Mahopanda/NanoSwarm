export type ChatHistory = Array<{ role: 'user' | 'assistant'; content: string }>;

export interface AgentResult {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface ResolvedAgent {
  id: string;
  name: string;
  description?: string;
  handle(
    contextId: string,
    text: string,
    history?: ChatHistory,
    opts?: { channel?: string; chatId?: string },
  ): Promise<AgentResult>;
}

export interface AgentStore {
  get(id: string): ResolvedAgent | undefined;
  getDefault(): ResolvedAgent | undefined;
  list(): Array<{ id: string; name: string; description?: string }>;
  has(id: string): boolean;
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

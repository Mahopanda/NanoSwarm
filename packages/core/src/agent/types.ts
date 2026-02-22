import type { LanguageModel } from 'ai';

export interface AgentLoopConfig {
  model: LanguageModel;
  maxIterations?: number; // default 15
  temperature?: number; // default 0.7
  maxTokens?: number; // default 4096
}

export interface AgentLoopResult {
  text: string;
  toolCalls: Array<{ toolName: string; args: Record<string, unknown> }>;
  steps: number;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: string;
}

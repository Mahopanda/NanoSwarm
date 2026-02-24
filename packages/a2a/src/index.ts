// @nanoswarm/a2a — barrel export
export { AgentRegistry, buildInternalCard, type AgentCardConfig } from './registry.ts';
export { A2AClientHandler, extractTextFromResult } from './client-handler.ts';
export { connectExternalAgent, connectExternalAgents, type ExternalAgentDefinition } from './client-factory.ts';
export { GatewayExecutor } from './gateway/executor.ts';
export { createGateway, type GatewayOptions } from './gateway/gateway.ts';
export { createPerAgentGateway, type PerAgentGatewayOptions, type PerAgentGateway } from './gateway/per-agent-gateway.ts';
export { filterToExternalCard } from './gateway/external-card.ts';
export { isExternalEntry } from './types.ts';
export type {
  InternalAgentEntry,
  ExternalAgentEntry,
  AgentEntry,
  ExternalCardConfig,
  AgentHandler,
  InvokeAgentFn,
  AgentCard,
  AgentSkill,
  Task,
  Message,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
  TaskStore,
} from './types.ts';

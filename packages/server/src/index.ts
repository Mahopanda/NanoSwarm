// @nanoswarm/server — barrel export
export const VERSION = '0.1.0';

export { NanoSwarmExecutor } from './executor.ts';
export { buildAgentCard } from './agent-card.ts';
export { createServer } from './server.ts';
export type { NanoSwarmServer } from './server.ts';
export type { ServerConfig } from './types.ts';

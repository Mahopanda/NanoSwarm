// @nanoswarm/server — barrel export
export const VERSION = '0.1.0';

export { createServer } from './main.ts';
export type { NanoSwarmServer } from './main.ts';
export type { ServerConfig, AgentDefinition } from './types.ts';
export { loadConfig, resolveModel, resolveWorkspace } from './config.ts';
export type { NanoSwarmConfig } from './config.ts';

import { A2AClientHandler } from './client-handler.ts';
import type { ExternalAgentEntry } from './types.ts';

export interface ExternalAgentDefinition {
  id: string;
  name: string;
  url: string;
}

export function connectExternalAgent(def: ExternalAgentDefinition): ExternalAgentEntry {
  return {
    id: def.id,
    name: def.name,
    url: def.url,
    handler: new A2AClientHandler(def.url),
  };
}

export function connectExternalAgents(defs: ExternalAgentDefinition[]): ExternalAgentEntry[] {
  return defs.map(connectExternalAgent);
}

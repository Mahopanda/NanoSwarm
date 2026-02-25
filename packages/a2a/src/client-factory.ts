import { A2AClientHandler } from './client-handler.ts';
import type { AgentCard } from '@a2a-js/sdk';
import type { AgentEntry } from './types.ts';

export interface ExternalAgentDefinition {
  id: string;
  name: string;
  url: string;
  description?: string;
}

export async function connectExternalAgent(def: ExternalAgentDefinition): Promise<AgentEntry> {
  const handler = new A2AClientHandler(def.url);

  let card: AgentCard | undefined;
  try {
    const cardUrl = new URL('.well-known/agent-card.json', def.url.endsWith('/') ? def.url : def.url + '/');
    const res = await fetch(cardUrl.toString());
    if (res.ok) {
      card = (await res.json()) as AgentCard;
    }
  } catch {
    // Card fetch failed — logged at server startup
  }

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    kind: 'external',
    url: def.url,
    card,
    handler,
  };
}

export async function connectExternalAgents(defs: ExternalAgentDefinition[]): Promise<AgentEntry[]> {
  return Promise.all(defs.map(connectExternalAgent));
}

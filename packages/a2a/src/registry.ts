import type { AgentCard, AgentSkill } from '@a2a-js/sdk';
import type { LoadedSkill } from '@nanoswarm/core';
import type { InternalAgentEntry, ExternalAgentEntry, AgentEntry, AgentHandler } from './types.ts';
import { isExternalEntry } from './types.ts';

export interface AgentCardConfig {
  name: string;
  description: string;
  version: string;
  url: string;
}

export class AgentRegistry {
  private agents = new Map<string, AgentEntry>();
  private defaultId: string | null = null;

  register(entry: AgentEntry, opts?: { default?: boolean }): void {
    this.agents.set(entry.id, entry);
    if (opts?.default || this.agents.size === 1) {
      this.defaultId = entry.id;
    }
  }

  get(id: string): AgentEntry | undefined {
    return this.agents.get(id);
  }

  getDefault(): AgentEntry | undefined {
    return this.defaultId ? this.agents.get(this.defaultId) : undefined;
  }

  list(): AgentEntry[] {
    return [...this.agents.values()];
  }

  listInternal(): InternalAgentEntry[] {
    return [...this.agents.values()].filter((e): e is InternalAgentEntry => !isExternalEntry(e));
  }

  listExternal(): ExternalAgentEntry[] {
    return [...this.agents.values()].filter((e): e is ExternalAgentEntry => isExternalEntry(e));
  }

  has(id: string): boolean {
    return this.agents.has(id);
  }
}

export function buildInternalCard(
  config: AgentCardConfig,
  skills: LoadedSkill[] = [],
): AgentCard {
  const agentSkills: AgentSkill[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    tags: s.tags,
    inputModes: s.inputModes.length > 0 ? s.inputModes : undefined,
    outputModes: s.outputModes.length > 0 ? s.outputModes : undefined,
  }));

  return {
    name: config.name,
    description: config.description,
    version: config.version,
    protocolVersion: '0.3.0',
    url: config.url,
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    skills: agentSkills,
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
  };
}

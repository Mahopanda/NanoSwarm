import type { AgentCard, AgentSkill } from '@a2a-js/sdk';
import type { LoadedSkill } from '@nanoswarm/core';
import type { ServerConfig } from './types.ts';

export function buildAgentCard(config: ServerConfig, skills: LoadedSkill[]): AgentCard {
  const name = config.name ?? 'NanoSwarm';
  const version = config.version ?? '0.1.0';
  const host = config.host ?? 'localhost';
  const port = config.port ?? 4000;
  const url = `http://${host}:${port}/a2a/jsonrpc`;

  const agentSkills: AgentSkill[] = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    tags: s.tags,
    inputModes: s.inputModes.length > 0 ? s.inputModes : undefined,
    outputModes: s.outputModes.length > 0 ? s.outputModes : undefined,
  }));

  return {
    name,
    description: config.description ?? 'A NanoSwarm agent',
    version,
    protocolVersion: '0.3.0',
    url,
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

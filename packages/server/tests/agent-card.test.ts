import { describe, it, expect } from 'bun:test';
import { buildAgentCard } from '../src/agent-card.ts';
import type { ServerConfig } from '../src/types.ts';
import type { LoadedSkill } from '@nanoswarm/core';

const mockModel = { modelId: 'test-model' } as any;

const baseConfig: ServerConfig = {
  model: mockModel,
  workspace: '/tmp/test',
};

const sampleSkills: LoadedSkill[] = [
  {
    id: 'general',
    name: 'General Assistant',
    description: 'A general-purpose assistant',
    tags: ['general', 'assistant'],
    content: 'You are a helpful assistant.',
    tools: ['read_file', 'write_file'],
    alwaysLoad: true,
    inputModes: ['text/plain'],
    outputModes: ['text/plain'],
  },
  {
    id: 'coder',
    name: 'Code Helper',
    description: 'Helps with coding tasks',
    tags: ['code'],
    content: 'You help with code.',
    tools: ['exec'],
    alwaysLoad: false,
    inputModes: [],
    outputModes: [],
  },
];

describe('buildAgentCard', () => {
  it('should use default values when not specified', () => {
    const card = buildAgentCard(baseConfig, []);

    expect(card.name).toBe('NanoSwarm');
    expect(card.description).toBe('A NanoSwarm agent');
    expect(card.version).toBe('0.1.0');
    expect(card.protocolVersion).toBe('0.3.0');
    expect(card.url).toBe('http://localhost:4000/a2a/jsonrpc');
  });

  it('should use custom config values', () => {
    const config: ServerConfig = {
      ...baseConfig,
      name: 'MyAgent',
      description: 'My custom agent',
      version: '1.0.0',
      host: '0.0.0.0',
      port: 8080,
    };

    const card = buildAgentCard(config, []);

    expect(card.name).toBe('MyAgent');
    expect(card.description).toBe('My custom agent');
    expect(card.version).toBe('1.0.0');
    expect(card.url).toBe('http://0.0.0.0:8080/a2a/jsonrpc');
  });

  it('should set correct capabilities', () => {
    const card = buildAgentCard(baseConfig, []);

    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.capabilities.stateTransitionHistory).toBe(true);
  });

  it('should set default input/output modes', () => {
    const card = buildAgentCard(baseConfig, []);

    expect(card.defaultInputModes).toEqual(['text/plain']);
    expect(card.defaultOutputModes).toEqual(['text/plain']);
  });

  it('should convert LoadedSkill[] to AgentSkill[]', () => {
    const card = buildAgentCard(baseConfig, sampleSkills);

    expect(card.skills).toHaveLength(2);

    expect(card.skills[0].id).toBe('general');
    expect(card.skills[0].name).toBe('General Assistant');
    expect(card.skills[0].description).toBe('A general-purpose assistant');
    expect(card.skills[0].tags).toEqual(['general', 'assistant']);
    expect(card.skills[0].inputModes).toEqual(['text/plain']);
    expect(card.skills[0].outputModes).toEqual(['text/plain']);
  });

  it('should omit inputModes/outputModes when empty', () => {
    const card = buildAgentCard(baseConfig, sampleSkills);

    // Second skill has empty inputModes/outputModes
    expect(card.skills[1].inputModes).toBeUndefined();
    expect(card.skills[1].outputModes).toBeUndefined();
  });

  it('should handle zero skills', () => {
    const card = buildAgentCard(baseConfig, []);
    expect(card.skills).toEqual([]);
  });
});

import { describe, it, expect } from 'bun:test';
import { filterToExternalCard } from '../../src/gateway/external-card.ts';
import type { AgentCard } from '@a2a-js/sdk';

const internalCard: AgentCard = {
  name: 'TestAgent',
  description: 'A test agent',
  version: '0.1.0',
  protocolVersion: '0.3.0',
  url: 'http://localhost:4000/a2a/jsonrpc',
  capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
  skills: [
    { id: 'general', name: 'General', description: 'General assistant', tags: ['general'] },
    { id: 'internal-debug', name: 'Debug', description: 'Internal debugging', tags: ['internal'] },
    { id: 'coder', name: 'Coder', description: 'Code helper', tags: ['code'] },
  ],
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
};

describe('filterToExternalCard', () => {
  it('should rewrite URL to external base URL', () => {
    const external = filterToExternalCard(internalCard, {
      baseUrl: 'https://api.example.com',
    });

    expect(external.url).toBe('https://api.example.com/a2a/jsonrpc');
  });

  it('should preserve other card fields', () => {
    const external = filterToExternalCard(internalCard, {
      baseUrl: 'https://api.example.com',
    });

    expect(external.name).toBe('TestAgent');
    expect(external.description).toBe('A test agent');
    expect(external.version).toBe('0.1.0');
    expect(external.protocolVersion).toBe('0.3.0');
    expect(external.capabilities).toEqual(internalCard.capabilities);
  });

  it('should keep all skills when no filter provided', () => {
    const external = filterToExternalCard(internalCard, {
      baseUrl: 'https://api.example.com',
    });

    expect(external.skills).toHaveLength(3);
  });

  it('should filter skills when skillFilter provided', () => {
    const external = filterToExternalCard(internalCard, {
      baseUrl: 'https://api.example.com',
      skillFilter: (skill) => !skill.tags?.includes('internal'),
    });

    expect(external.skills).toHaveLength(2);
    expect(external.skills.map((s) => s.id)).toEqual(['general', 'coder']);
  });

  it('should not mutate the original card', () => {
    const original = { ...internalCard, skills: [...internalCard.skills] };

    filterToExternalCard(internalCard, {
      baseUrl: 'https://api.example.com',
      skillFilter: (s) => s.id === 'general',
    });

    expect(internalCard.skills).toHaveLength(3);
    expect(internalCard.url).toBe('http://localhost:4000/a2a/jsonrpc');
  });
});

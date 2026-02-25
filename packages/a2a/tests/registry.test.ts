import { describe, it, expect, mock } from 'bun:test';
import { AgentRegistry, buildInternalCard } from '../src/registry.ts';
import type { AgentEntry, AgentHandler } from '../src/types.ts';
import type { AgentCard } from '@a2a-js/sdk';
import type { LoadedSkill } from '@nanoswarm/core';

function createMockHandler(): AgentHandler {
  return {
    chat: mock(async () => ({ text: 'mock response' })),
  };
}

function createMockCard(name = 'TestAgent'): AgentCard {
  return {
    name,
    description: 'A test agent',
    version: '0.1.0',
    protocolVersion: '0.3.0',
    url: 'http://localhost:4000/a2a/jsonrpc',
    capabilities: { streaming: true, pushNotifications: false, stateTransitionHistory: true },
    skills: [],
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain'],
  };
}

function createEntry(id = 'default', name = 'TestAgent'): AgentEntry {
  return {
    id,
    name,
    kind: 'internal',
    card: createMockCard(name),
    handler: createMockHandler(),
  };
}

describe('AgentRegistry', () => {
  describe('register', () => {
    it('should register an agent entry', () => {
      const registry = new AgentRegistry();
      const entry = createEntry();
      registry.register(entry);

      expect(registry.get('default')).toBe(entry);
    });

    it('should set first registered as default', () => {
      const registry = new AgentRegistry();
      const entry = createEntry();
      registry.register(entry);

      expect(registry.getDefault()).toBe(entry);
    });

    it('should allow explicit default override', () => {
      const registry = new AgentRegistry();
      const entry1 = createEntry('a1', 'Agent1');
      const entry2 = createEntry('a2', 'Agent2');

      registry.register(entry1);
      registry.register(entry2, { default: true });

      expect(registry.getDefault()).toBe(entry2);
    });
  });

  describe('get', () => {
    it('should return entry by id', () => {
      const registry = new AgentRegistry();
      const entry = createEntry('my-agent');
      registry.register(entry);

      expect(registry.get('my-agent')).toBe(entry);
    });

    it('should return undefined for unknown id', () => {
      const registry = new AgentRegistry();
      expect(registry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('should return all registered entries', () => {
      const registry = new AgentRegistry();
      registry.register(createEntry('a1'));
      registry.register(createEntry('a2'));

      expect(registry.list()).toHaveLength(2);
    });

    it('should return empty array when none registered', () => {
      const registry = new AgentRegistry();
      expect(registry.list()).toEqual([]);
    });
  });

  describe('has', () => {
    it('should return true for registered agent', () => {
      const registry = new AgentRegistry();
      registry.register(createEntry('a1'));
      expect(registry.has('a1')).toBe(true);
    });

    it('should return false for unregistered agent', () => {
      const registry = new AgentRegistry();
      expect(registry.has('a1')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should remove an existing agent', () => {
      const registry = new AgentRegistry();
      registry.register(createEntry('a1'));

      expect(registry.unregister('a1')).toBe(true);
      expect(registry.has('a1')).toBe(false);
      expect(registry.get('a1')).toBeUndefined();
    });

    it('should return false for non-existent id', () => {
      const registry = new AgentRegistry();
      expect(registry.unregister('nonexistent')).toBe(false);
    });

    it('should reassign default when default agent is removed', () => {
      const registry = new AgentRegistry();
      const entry1 = createEntry('a1', 'Agent1');
      const entry2 = createEntry('a2', 'Agent2');
      registry.register(entry1);
      registry.register(entry2);

      // a1 is default (first registered)
      expect(registry.getDefault()).toBe(entry1);

      registry.unregister('a1');
      // default should move to next available
      expect(registry.getDefault()).toBe(entry2);
    });

    it('should set default to null when last agent is removed', () => {
      const registry = new AgentRegistry();
      registry.register(createEntry('a1'));

      registry.unregister('a1');
      expect(registry.getDefault()).toBeUndefined();
    });

    it('should not change default when non-default agent is removed', () => {
      const registry = new AgentRegistry();
      const entry1 = createEntry('a1', 'Agent1');
      const entry2 = createEntry('a2', 'Agent2');
      registry.register(entry1);
      registry.register(entry2);

      registry.unregister('a2');
      expect(registry.getDefault()).toBe(entry1);
    });
  });

  describe('external agents', () => {
    function createExternalEntry(id = 'ext-1', name = 'ExternalAgent'): AgentEntry {
      return {
        id,
        name,
        kind: 'external',
        url: 'http://localhost:5000',
        handler: createMockHandler(),
      };
    }

    it('should register external agent entry', () => {
      const registry = new AgentRegistry();
      const entry = createExternalEntry();
      registry.register(entry);

      expect(registry.get('ext-1')).toBe(entry);
      expect(registry.has('ext-1')).toBe(true);
    });

    it('should list mixed internal and external entries', () => {
      const registry = new AgentRegistry();
      registry.register(createEntry('internal-1'));
      registry.register(createExternalEntry('ext-1'));

      expect(registry.list()).toHaveLength(2);
    });

    it('should filter internal entries with list + kind', () => {
      const registry = new AgentRegistry();
      registry.register(createEntry('internal-1'));
      registry.register(createExternalEntry('ext-1'));
      registry.register(createEntry('internal-2'));

      const internal = registry.list().filter(e => e.kind === 'internal');
      expect(internal).toHaveLength(2);
      expect(internal.every(e => e.card !== undefined)).toBe(true);
    });

    it('should filter external entries with list + kind', () => {
      const registry = new AgentRegistry();
      registry.register(createEntry('internal-1'));
      registry.register(createExternalEntry('ext-1'));
      registry.register(createExternalEntry('ext-2'));

      const external = registry.list().filter(e => e.kind === 'external');
      expect(external).toHaveLength(2);
      expect(external.every(e => e.url !== undefined)).toBe(true);
    });

    it('should return empty when no matching kind', () => {
      const registry = new AgentRegistry();
      registry.register(createEntry('internal-1'));

      expect(registry.list().filter(e => e.kind === 'external')).toEqual([]);
    });
  });
});

describe('buildInternalCard', () => {
  const baseConfig = {
    name: 'TestAgent',
    description: 'A test agent',
    version: '0.1.0',
    url: 'http://localhost:4000/a2a/jsonrpc',
  };

  it('should build card with correct fields', () => {
    const card = buildInternalCard(baseConfig);

    expect(card.name).toBe('TestAgent');
    expect(card.description).toBe('A test agent');
    expect(card.version).toBe('0.1.0');
    expect(card.protocolVersion).toBe('0.3.0');
    expect(card.url).toBe('http://localhost:4000/a2a/jsonrpc');
  });

  it('should set correct capabilities', () => {
    const card = buildInternalCard(baseConfig);

    expect(card.capabilities.streaming).toBe(true);
    expect(card.capabilities.pushNotifications).toBe(false);
    expect(card.capabilities.stateTransitionHistory).toBe(true);
  });

  it('should set default input/output modes', () => {
    const card = buildInternalCard(baseConfig);

    expect(card.defaultInputModes).toEqual(['text/plain']);
    expect(card.defaultOutputModes).toEqual(['text/plain']);
  });

  it('should convert LoadedSkill[] to AgentSkill[]', () => {
    const skills: LoadedSkill[] = [
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
    ];

    const card = buildInternalCard(baseConfig, skills);

    expect(card.skills).toHaveLength(1);
    expect(card.skills[0].id).toBe('general');
    expect(card.skills[0].name).toBe('General Assistant');
    expect(card.skills[0].description).toBe('A general-purpose assistant');
    expect(card.skills[0].tags).toEqual(['general', 'assistant']);
    expect(card.skills[0].inputModes).toEqual(['text/plain']);
    expect(card.skills[0].outputModes).toEqual(['text/plain']);
  });

  it('should omit inputModes/outputModes when empty', () => {
    const skills: LoadedSkill[] = [
      {
        id: 'coder',
        name: 'Code Helper',
        description: 'Helps with code',
        tags: ['code'],
        content: 'You help with code.',
        tools: ['exec'],
        alwaysLoad: false,
        inputModes: [],
        outputModes: [],
      },
    ];

    const card = buildInternalCard(baseConfig, skills);

    expect(card.skills[0].inputModes).toBeUndefined();
    expect(card.skills[0].outputModes).toBeUndefined();
  });

  it('should handle zero skills', () => {
    const card = buildInternalCard(baseConfig, []);
    expect(card.skills).toEqual([]);
  });
});

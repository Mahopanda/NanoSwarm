import { describe, it, expect, mock, beforeEach, afterEach } from 'bun:test';
import { connectExternalAgent, connectExternalAgents } from '../src/client-factory.ts';
import type { AgentCard } from '@a2a-js/sdk';

// Mock A2AClientHandler to avoid real ClientFactory usage
mock.module('../src/client-handler.ts', () => ({
  A2AClientHandler: class {
    constructor(public baseUrl: string) {}
    async chat() {
      return { text: 'mock' };
    }
  },
}));

const mockCard: AgentCard = {
  name: 'Remote Agent',
  description: 'A remote test agent',
  version: '1.0.0',
  protocolVersion: '0.3.0',
  url: 'http://localhost:5000/a2a/jsonrpc',
  capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
  skills: [],
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['text/plain'],
};

describe('connectExternalAgent', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should fetch Agent Card on success', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockCard), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ) as typeof fetch;

    const entry = await connectExternalAgent({
      id: 'ext-1',
      name: 'Remote Agent',
      url: 'http://localhost:5000',
    });

    expect(entry.id).toBe('ext-1');
    expect(entry.name).toBe('Remote Agent');
    expect(entry.url).toBe('http://localhost:5000');
    expect(entry.card).toBeDefined();
    expect(entry.card!.name).toBe('Remote Agent');
    expect(entry.card!.description).toBe('A remote test agent');
    expect(entry.handler).toBeDefined();

    // Verify fetch was called with correct URL
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const fetchedUrl = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0];
    expect(fetchedUrl).toBe('http://localhost:5000/.well-known/agent-card.json');
  });

  it('should set card to undefined when fetch fails (network error)', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('Connection refused');
    }) as typeof fetch;

    const entry = await connectExternalAgent({
      id: 'ext-1',
      name: 'Offline Agent',
      url: 'http://unreachable:9999',
    });

    expect(entry.id).toBe('ext-1');
    expect(entry.card).toBeUndefined();
    expect(entry.handler).toBeDefined();
  });

  it('should set card to undefined when fetch returns non-ok status', async () => {
    globalThis.fetch = mock(async () =>
      new Response('Not Found', { status: 404 }),
    ) as typeof fetch;

    const entry = await connectExternalAgent({
      id: 'ext-1',
      name: 'No Card Agent',
      url: 'http://localhost:5000',
    });

    expect(entry.card).toBeUndefined();
    expect(entry.handler).toBeDefined();
  });

  it('should handle URL with trailing slash correctly', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockCard), { status: 200 }),
    ) as typeof fetch;

    await connectExternalAgent({
      id: 'ext-1',
      name: 'Agent',
      url: 'http://localhost:5000/',
    });

    const fetchedUrl = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0];
    expect(fetchedUrl).toBe('http://localhost:5000/.well-known/agent-card.json');
  });

  it('should handle URL without trailing slash correctly', async () => {
    globalThis.fetch = mock(async () =>
      new Response(JSON.stringify(mockCard), { status: 200 }),
    ) as typeof fetch;

    await connectExternalAgent({
      id: 'ext-1',
      name: 'Agent',
      url: 'http://localhost:5000',
    });

    const fetchedUrl = (globalThis.fetch as ReturnType<typeof mock>).mock.calls[0][0];
    expect(fetchedUrl).toBe('http://localhost:5000/.well-known/agent-card.json');
  });
});

describe('connectExternalAgents', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('should connect multiple agents in parallel', async () => {
    let callCount = 0;
    globalThis.fetch = mock(async () => {
      callCount++;
      return new Response(JSON.stringify({ ...mockCard, name: `Agent-${callCount}` }), { status: 200 });
    }) as typeof fetch;

    const entries = await connectExternalAgents([
      { id: 'ext-1', name: 'Agent 1', url: 'http://localhost:5001' },
      { id: 'ext-2', name: 'Agent 2', url: 'http://localhost:5002' },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe('ext-1');
    expect(entries[1].id).toBe('ext-2');
    expect(entries[0].card).toBeDefined();
    expect(entries[1].card).toBeDefined();
  });

  it('should handle mixed success and failure', async () => {
    let callIndex = 0;
    globalThis.fetch = mock(async () => {
      callIndex++;
      if (callIndex === 1) {
        return new Response(JSON.stringify(mockCard), { status: 200 });
      }
      throw new Error('Connection refused');
    }) as typeof fetch;

    const entries = await connectExternalAgents([
      { id: 'ext-1', name: 'Online', url: 'http://localhost:5001' },
      { id: 'ext-2', name: 'Offline', url: 'http://unreachable:9999' },
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[0].card).toBeDefined();
    expect(entries[1].card).toBeUndefined();
  });

  it('should return empty array for empty input', async () => {
    const entries = await connectExternalAgents([]);
    expect(entries).toEqual([]);
  });
});

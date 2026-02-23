import { describe, it, expect } from 'bun:test';
import {
  AgentRegistry,
  buildInternalCard,
  A2ARouter,
  GatewayExecutor,
  createGateway,
  filterToExternalCard,
} from '../src/index.ts';
import type {
  InternalAgentEntry,
  ExternalCardConfig,
  AgentHandler,
  AgentCard,
  AgentSkill,
} from '../src/index.ts';

describe('a2a barrel export', () => {
  it('should export AgentRegistry', () => {
    expect(AgentRegistry).toBeDefined();
    expect(new AgentRegistry()).toBeInstanceOf(AgentRegistry);
  });

  it('should export buildInternalCard', () => {
    expect(buildInternalCard).toBeInstanceOf(Function);
  });

  it('should export A2ARouter', () => {
    expect(A2ARouter).toBeDefined();
  });

  it('should export GatewayExecutor', () => {
    expect(GatewayExecutor).toBeDefined();
  });

  it('should export createGateway', () => {
    expect(createGateway).toBeInstanceOf(Function);
  });

  it('should export filterToExternalCard', () => {
    expect(filterToExternalCard).toBeInstanceOf(Function);
  });

  it('should export types (compile-time check)', () => {
    const _handler: AgentHandler = { chat: async () => ({ text: '' }) };
    const _config: ExternalCardConfig = { baseUrl: 'http://example.com' };

    expect(true).toBe(true);
  });
});

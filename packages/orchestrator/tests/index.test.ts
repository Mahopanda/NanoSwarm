import { describe, it, expect } from 'bun:test';
import { Orchestrator, TaskManager } from '../src/index.ts';
import type { AgentResult, ResolvedAgent, AgentStore, TaskRecord, TaskState } from '../src/index.ts';

describe('orchestrator barrel export', () => {
  it('should export Orchestrator', () => {
    expect(Orchestrator).toBeDefined();
  });

  it('should export TaskManager', () => {
    expect(TaskManager).toBeDefined();
    expect(new TaskManager()).toBeInstanceOf(TaskManager);
  });

  it('should export types (compile-time check)', () => {
    const _result: AgentResult = { text: 'hello' };
    const _agent: ResolvedAgent = {
      id: '1',
      name: 'test',
      handle: async () => _result,
    };
    const _store: AgentStore = {
      get: () => _agent,
      getDefault: () => _agent,
      list: () => [{ id: '1', name: 'test' }],
      has: () => true,
    };
    const _state: TaskState = 'pending';

    expect(true).toBe(true);
  });
});

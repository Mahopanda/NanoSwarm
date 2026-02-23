import { describe, it, expect } from 'bun:test';
import { Orchestrator, TaskManager } from '../src/index.ts';
import type { AgentResult, AgentHandle, TaskRecord, TaskState } from '../src/index.ts';

describe('orchestrator barrel export', () => {
  it('should export Orchestrator', () => {
    expect(Orchestrator).toBeDefined();
    expect(new Orchestrator()).toBeInstanceOf(Orchestrator);
  });

  it('should export TaskManager', () => {
    expect(TaskManager).toBeDefined();
    expect(new TaskManager()).toBeInstanceOf(TaskManager);
  });

  it('should export types (compile-time check)', () => {
    const _result: AgentResult = { text: 'hello' };
    const _handle: AgentHandle = {
      id: '1',
      name: 'test',
      handle: async () => _result,
    };
    const _state: TaskState = 'pending';

    expect(true).toBe(true);
  });
});

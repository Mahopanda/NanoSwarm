import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { SubagentManager } from '../../src/agent/subagent-manager.ts';
import { ToolRegistry } from '../../src/tools/registry.ts';
import { EventBus } from '../../src/events/event-bus.ts';
import { ContextBuilder } from '../../src/context/context-builder.ts';
import { SkillLoader } from '../../src/skills/loader.ts';
import { FileMemoryStore } from '../../src/memory/memory-store.ts';
import type { AgentLoopConfig } from '../../src/agent/types.ts';

// Mock generateText to hang until aborted
const mockGenerateText = mock(async ({ abortSignal }: { abortSignal?: AbortSignal } = {}) => {
  // Simulate a long-running task that respects abort
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 5000);
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    }
  });
  return {
    text: 'done',
    steps: [{ stepNumber: 0, text: 'done', finishReason: 'stop', toolCalls: [] }],
    totalUsage: { inputTokens: 10, outputTokens: 5 },
    finishReason: 'stop',
  };
});

mock.module('ai', () => ({
  generateText: mockGenerateText,
  stepCountIs: (n: number) => ({ type: 'stepCount', value: n }),
  tool: (config: any) => config,
}));

describe('SubagentManager cancelTask', () => {
  let manager: SubagentManager;
  let eventBus: EventBus;

  beforeEach(() => {
    mockGenerateText.mockClear();
    eventBus = new EventBus();
    const registry = new ToolRegistry();

    const skillLoader = new SkillLoader();
    const memoryStore = new FileMemoryStore('/tmp/test-workspace');
    const contextBuilder = new ContextBuilder('/tmp/test-workspace', skillLoader, memoryStore);
    const config: AgentLoopConfig = {
      model: { modelId: 'test-model' } as any,
      maxIterations: 15,
    };

    manager = new SubagentManager(config, contextBuilder, registry, eventBus);
  });

  it('should cancel an existing task and return true', async () => {
    const result = await manager.spawn('Long task', 'long');
    const taskId = result.match(/id: ([a-f0-9]+)/)?.[1];
    expect(taskId).toBeTruthy();
    expect(manager.getRunningCount()).toBe(1);

    const cancelled = manager.cancelTask(taskId!);
    expect(cancelled).toBe(true);
    expect(manager.getRunningCount()).toBe(0);
  });

  it('should return false when cancelling a non-existent task', () => {
    const cancelled = manager.cancelTask('nonexistent');
    expect(cancelled).toBe(false);
  });

  it('should remove cancelled task from getRunningTasks', async () => {
    const result = await manager.spawn('Task to cancel', 'cancel-me');
    const taskId = result.match(/id: ([a-f0-9]+)/)?.[1];

    expect(manager.getRunningTasks().some((t) => t.taskId === taskId)).toBe(true);
    manager.cancelTask(taskId!);
    expect(manager.getRunningTasks().some((t) => t.taskId === taskId)).toBe(false);
  });
});

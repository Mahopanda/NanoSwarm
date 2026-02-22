import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { SubagentManager } from '../../src/agent/subagent-manager.ts';
import { ToolRegistry } from '../../src/tools/registry.ts';
import { EventBus } from '../../src/events/event-bus.ts';
import { ContextBuilder } from '../../src/context/context-builder.ts';
import { SkillLoader } from '../../src/skills/loader.ts';
import { FileMemoryStore } from '../../src/memory/memory-store.ts';
import type { AgentLoopConfig } from '../../src/agent/types.ts';
import type { NanoTool } from '../../src/tools/base.ts';
import { z } from 'zod';

// Mock generateText
const mockGenerateText = mock(async () => ({
  text: 'Subagent task completed.',
  steps: [
    {
      stepNumber: 0,
      text: 'Subagent task completed.',
      finishReason: 'stop',
      toolCalls: [],
      toolResults: [],
    },
  ],
  totalUsage: { inputTokens: 50, outputTokens: 20 },
  finishReason: 'stop',
}));

mock.module('ai', () => ({
  generateText: mockGenerateText,
  stepCountIs: (n: number) => ({ type: 'stepCount', value: n }),
  tool: (config: any) => config,
}));

function makeDummyTool(name: string): NanoTool {
  return {
    name,
    description: `Dummy ${name} tool`,
    parameters: z.object({}),
    execute: async () => `${name} executed`,
  };
}

describe('SubagentManager', () => {
  let manager: SubagentManager;
  let eventBus: EventBus;
  let registry: ToolRegistry;

  beforeEach(() => {
    mockGenerateText.mockClear();
    eventBus = new EventBus();
    registry = new ToolRegistry();

    // Register tools including restricted ones
    registry.register(makeDummyTool('read_file'));
    registry.register(makeDummyTool('write_file'));
    registry.register(makeDummyTool('message'));
    registry.register(makeDummyTool('spawn'));
    registry.register(makeDummyTool('cron'));

    const skillLoader = new SkillLoader();
    const memoryStore = new FileMemoryStore('/tmp/test-workspace');
    const contextBuilder = new ContextBuilder('/tmp/test-workspace', skillLoader, memoryStore);
    const config: AgentLoopConfig = {
      model: { modelId: 'test-model' } as any,
      maxIterations: 30,
    };

    manager = new SubagentManager(config, contextBuilder, registry, eventBus);
  });

  it('should spawn a subagent and return status message', async () => {
    const result = await manager.spawn('Do a task', 'my-task');
    expect(result).toContain('Subagent [my-task] started');
    expect(result).toContain('id:');
  });

  it('should generate a default label when none provided', async () => {
    const result = await manager.spawn('Do a task');
    expect(result).toContain('Subagent [task-');
    expect(result).toContain('started');
  });

  it('should track running tasks', async () => {
    // Delay the mock to keep it "running"
    mockGenerateText.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                text: 'done',
                steps: [{ stepNumber: 0, text: 'done', finishReason: 'stop', toolCalls: [] }],
                totalUsage: { inputTokens: 10, outputTokens: 5 },
                finishReason: 'stop',
              }),
            100,
          ),
        ),
    );

    await manager.spawn('Slow task', 'slow');
    // Task should be running
    expect(manager.getRunningCount()).toBe(1);
    expect(manager.getRunningTasks()[0].label).toBe('slow');

    // Wait for completion
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(manager.getRunningCount()).toBe(0);
  });

  it('should emit subagent-start event', async () => {
    const events: any[] = [];
    eventBus.on('subagent-start', (e) => events.push(e));

    await manager.spawn('Test task', 'test-label');

    expect(events).toHaveLength(1);
    expect(events[0].label).toBe('test-label');
    expect(events[0].task).toBe('Test task');
    expect(events[0].taskId).toBeTruthy();
  });

  it('should emit subagent-finish event on completion', async () => {
    const events: any[] = [];
    eventBus.on('subagent-finish', (e) => events.push(e));

    await manager.spawn('Test task', 'test-label');

    // Wait for background completion
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events).toHaveLength(1);
    expect(events[0].label).toBe('test-label');
    expect(events[0].result).toBe('Subagent task completed.');
  });

  it('should create restricted registry without message/spawn/cron', async () => {
    await manager.spawn('Restricted task');

    // Wait for background AgentLoop to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Verify the generateText was called with tools
    expect(mockGenerateText).toHaveBeenCalled();
    const call = mockGenerateText.mock.calls[0][0] as any;
    const toolNames = Object.keys(call.tools);

    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('write_file');
    expect(toolNames).not.toContain('message');
    expect(toolNames).not.toContain('spawn');
    expect(toolNames).not.toContain('cron');
  });

  it('should use maxIterations of 15 for subagents', async () => {
    await manager.spawn('Limited task');

    // Wait for background AgentLoop to complete
    await new Promise((resolve) => setTimeout(resolve, 50));

    const call = mockGenerateText.mock.calls[0][0] as any;
    expect(call.stopWhen).toEqual({ type: 'stepCount', value: 15 });
  });

  it('should emit subagent-finish with error on failure', async () => {
    mockGenerateText.mockImplementationOnce(async () => {
      throw new Error('LLM failure');
    });

    const events: any[] = [];
    eventBus.on('subagent-finish', (e) => events.push(e));

    await manager.spawn('Failing task', 'fail-label');

    // Wait for background failure
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(events).toHaveLength(1);
    expect(events[0].result).toContain('Error: LLM failure');
    expect(manager.getRunningCount()).toBe(0);
  });
});

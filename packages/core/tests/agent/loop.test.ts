import { describe, it, expect, mock, beforeEach } from 'bun:test';
import { AgentLoop } from '../../src/agent/loop.ts';
import { EventBus } from '../../src/events/event-bus.ts';
import { ToolRegistry } from '../../src/tools/registry.ts';
import { ContextBuilder } from '../../src/context/context-builder.ts';
import { SkillLoader } from '../../src/skills/loader.ts';
import { FileMemoryStore } from '../../src/memory/memory-store.ts';
import type { AgentLoopConfig } from '../../src/agent/types.ts';

// Mock generateText
const mockGenerateText = mock(async () => ({
  text: 'Hello! I am here to help.',
  steps: [
    {
      stepNumber: 0,
      text: 'Hello! I am here to help.',
      finishReason: 'stop',
      toolCalls: [],
      toolResults: [],
    },
  ],
  totalUsage: { inputTokens: 100, outputTokens: 50 },
  finishReason: 'stop',
}));

mock.module('ai', () => ({
  generateText: mockGenerateText,
  stepCountIs: (n: number) => ({ type: 'stepCount', value: n }),
  tool: (config: any) => config,
}));

describe('AgentLoop', () => {
  let eventBus: EventBus;
  let registry: ToolRegistry;
  let contextBuilder: ContextBuilder;
  let config: AgentLoopConfig;
  let loop: AgentLoop;

  beforeEach(() => {
    mockGenerateText.mockClear();
    eventBus = new EventBus();
    registry = new ToolRegistry();
    const skillLoader = new SkillLoader();
    const memoryStore = new FileMemoryStore('/tmp/test-workspace');
    contextBuilder = new ContextBuilder('/tmp/test-workspace', skillLoader, memoryStore);

    config = {
      model: { modelId: 'test-model' } as any,
      maxIterations: 5,
      temperature: 0.5,
      maxTokens: 2048,
    };
    loop = new AgentLoop(config, contextBuilder, registry, eventBus);
  });

  it('should call generateText with correct parameters', async () => {
    await loop.run('ctx1', 'Hello');

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const call = mockGenerateText.mock.calls[0][0] as any;
    expect(call.system).toContain('NanoSwarm agent');
    expect(call.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    expect(call.temperature).toBe(0.5);
    expect(call.maxOutputTokens).toBe(2048);
  });

  it('should return formatted result', async () => {
    const result = await loop.run('ctx1', 'Hello');

    expect(result.text).toBe('Hello! I am here to help.');
    expect(result.steps).toBe(1);
    expect(result.finishReason).toBe('stop');
    expect(result.usage).toEqual({
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    });
    expect(result.toolCalls).toEqual([]);
  });

  it('should collect tool calls from steps', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Done reading the file.',
      steps: [
        {
          stepNumber: 0,
          text: '',
          finishReason: 'tool-calls',
          toolCalls: [{ toolName: 'read_file', input: { path: '/test.txt' } }],
          toolResults: [{ result: 'file content' }],
        },
        {
          stepNumber: 1,
          text: 'Done reading the file.',
          finishReason: 'stop',
          toolCalls: [],
          toolResults: [],
        },
      ],
      totalUsage: { inputTokens: 200, outputTokens: 80 },
      finishReason: 'stop',
    } as any);

    const result = await loop.run('ctx1', 'Read /test.txt');

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      toolName: 'read_file',
      args: { path: '/test.txt' },
    });
    expect(result.steps).toBe(2);
  });

  it('should pass history messages', async () => {
    await loop.run('ctx1', 'Follow up', [
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'First response' },
    ]);

    const call = mockGenerateText.mock.calls[0][0] as any;
    expect(call.messages).toHaveLength(3);
    expect(call.messages[0]).toEqual({ role: 'user', content: 'First message' });
    expect(call.messages[1]).toEqual({ role: 'assistant', content: 'First response' });
    expect(call.messages[2]).toEqual({ role: 'user', content: 'Follow up' });
  });

  it('should use default config values', async () => {
    const minConfig: AgentLoopConfig = {
      model: { modelId: 'test' } as any,
    };
    const minLoop = new AgentLoop(minConfig, contextBuilder, registry, eventBus);

    await minLoop.run('ctx1', 'test');

    const call = mockGenerateText.mock.calls[0][0] as any;
    expect(call.temperature).toBe(0.7);
    expect(call.maxOutputTokens).toBe(4096);
  });

  it('should emit step-finish events via onStepFinish callback', async () => {
    mockGenerateText.mockImplementationOnce(async (opts: any) => {
      if (opts.onStepFinish) {
        opts.onStepFinish({
          stepNumber: 0,
          text: 'Step done',
          finishReason: 'stop',
        });
      }
      return {
        text: 'Result',
        steps: [{ stepNumber: 0, text: 'Step done', finishReason: 'stop', toolCalls: [] }],
        totalUsage: { inputTokens: 10, outputTokens: 5 },
        finishReason: 'stop',
      };
    });

    const events: any[] = [];
    eventBus.on('step-finish', (e) => events.push(e));

    await loop.run('ctx1', 'Test');

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      stepNumber: 0,
      text: 'Step done',
      finishReason: 'stop',
    });
  });
});

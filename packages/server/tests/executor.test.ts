import { describe, it, expect, mock } from 'bun:test';
import { NanoSwarmExecutor } from '../src/executor.ts';
import type { Agent } from '@nanoswarm/core';
import type {
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  Message,
} from '@a2a-js/sdk';
import type { RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server';

function createMockAgent(chatResult = { text: 'Hello from agent', toolCalls: [], steps: 1, usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }, finishReason: 'end-turn' }): Agent {
  return {
    chat: mock(async () => chatResult),
  } as unknown as Agent;
}

function createMockEventBus() {
  const events: any[] = [];
  return {
    publish: mock((event: any) => { events.push(event); }),
    on: mock(() => {}),
    off: mock(() => {}),
    once: mock(() => {}),
    removeAllListeners: mock(() => {}),
    finished: mock(() => {}),
    events,
  } as unknown as ExecutionEventBus & { events: any[] };
}

function createMockMessage(text: string): Message {
  return {
    kind: 'message',
    messageId: 'msg-1',
    role: 'user',
    parts: [{ kind: 'text', text }],
    contextId: 'ctx-1',
    taskId: 'task-1',
  };
}

function createMockRequestContext(opts: {
  text?: string;
  taskId?: string;
  contextId?: string;
  existingTask?: Task;
} = {}): RequestContext {
  const message = createMockMessage(opts.text ?? 'Hello');
  return {
    userMessage: message,
    taskId: opts.taskId ?? 'task-1',
    contextId: opts.contextId ?? 'ctx-1',
    task: opts.existingTask,
  } as unknown as RequestContext;
}

describe('NanoSwarmExecutor', () => {
  describe('execute', () => {
    it('should publish Task → working → artifact → completed for new task', async () => {
      const agent = createMockAgent();
      const eventBus = createMockEventBus();
      const executor = new NanoSwarmExecutor(agent);
      const ctx = createMockRequestContext();

      await executor.execute(ctx, eventBus);

      expect(eventBus.events).toHaveLength(4);

      // 1. Initial task
      expect(eventBus.events[0].kind).toBe('task');
      expect(eventBus.events[0].id).toBe('task-1');
      expect(eventBus.events[0].status.state).toBe('submitted');

      // 2. Working status
      expect(eventBus.events[1].kind).toBe('status-update');
      expect((eventBus.events[1] as TaskStatusUpdateEvent).status.state).toBe('working');
      expect((eventBus.events[1] as TaskStatusUpdateEvent).final).toBe(false);

      // 3. Artifact
      expect(eventBus.events[2].kind).toBe('artifact-update');
      expect((eventBus.events[2] as TaskArtifactUpdateEvent).artifact.parts[0]).toEqual({
        kind: 'text',
        text: 'Hello from agent',
      });
      expect((eventBus.events[2] as TaskArtifactUpdateEvent).lastChunk).toBe(true);

      // 4. Completed
      expect(eventBus.events[3].kind).toBe('status-update');
      expect((eventBus.events[3] as TaskStatusUpdateEvent).status.state).toBe('completed');
      expect((eventBus.events[3] as TaskStatusUpdateEvent).final).toBe(true);
    });

    it('should skip initial Task event for existing task', async () => {
      const agent = createMockAgent();
      const eventBus = createMockEventBus();
      const executor = new NanoSwarmExecutor(agent);

      const existingTask: Task = {
        kind: 'task',
        id: 'task-1',
        contextId: 'ctx-1',
        status: { state: 'working' },
      };

      const ctx = createMockRequestContext({ existingTask });
      await executor.execute(ctx, eventBus);

      // Should be 3 events (no initial Task event)
      expect(eventBus.events).toHaveLength(3);
      expect(eventBus.events[0].kind).toBe('status-update');
    });

    it('should extract text from message parts', async () => {
      const agent = createMockAgent();
      const eventBus = createMockEventBus();
      const executor = new NanoSwarmExecutor(agent);
      const ctx = createMockRequestContext({ text: 'Test message' });

      await executor.execute(ctx, eventBus);

      expect(agent.chat).toHaveBeenCalledWith('ctx-1', 'Test message', undefined);
    });

    it('should convert history from existing task', async () => {
      const agent = createMockAgent();
      const eventBus = createMockEventBus();
      const executor = new NanoSwarmExecutor(agent);

      const existingTask: Task = {
        kind: 'task',
        id: 'task-1',
        contextId: 'ctx-1',
        status: { state: 'working' },
        history: [
          {
            kind: 'message',
            messageId: 'msg-0',
            role: 'user',
            parts: [{ kind: 'text', text: 'Previous question' }],
          },
          {
            kind: 'message',
            messageId: 'msg-1',
            role: 'agent',
            parts: [{ kind: 'text', text: 'Previous answer' }],
          },
        ],
      };

      const ctx = createMockRequestContext({ existingTask });
      await executor.execute(ctx, eventBus);

      expect(agent.chat).toHaveBeenCalledWith('ctx-1', 'Hello', [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ]);
    });

    it('should publish failed status on error', async () => {
      const agent = {
        chat: mock(async () => { throw new Error('LLM failed'); }),
      } as unknown as Agent;

      const eventBus = createMockEventBus();
      const executor = new NanoSwarmExecutor(agent);
      const ctx = createMockRequestContext();

      await executor.execute(ctx, eventBus);

      // Task → working → failed
      const lastEvent = eventBus.events[eventBus.events.length - 1] as TaskStatusUpdateEvent;
      expect(lastEvent.kind).toBe('status-update');
      expect(lastEvent.status.state).toBe('failed');
      expect(lastEvent.final).toBe(true);
      expect(lastEvent.status.message?.parts[0]).toEqual({
        kind: 'text',
        text: 'LLM failed',
      });
    });

    it('should handle empty message parts gracefully', async () => {
      const agent = createMockAgent();
      const eventBus = createMockEventBus();
      const executor = new NanoSwarmExecutor(agent);

      const ctx = {
        userMessage: {
          kind: 'message',
          messageId: 'msg-1',
          role: 'user',
          parts: [{ kind: 'file', file: { uri: 'test.png' } }],
        },
        taskId: 'task-1',
        contextId: 'ctx-1',
        task: undefined,
      } as unknown as RequestContext;

      await executor.execute(ctx, eventBus);

      expect(agent.chat).toHaveBeenCalledWith('ctx-1', '', undefined);
    });
  });

  describe('cancelTask', () => {
    it('should publish canceled status', async () => {
      const agent = createMockAgent();
      const eventBus = createMockEventBus();
      const executor = new NanoSwarmExecutor(agent);

      await executor.cancelTask('task-1', eventBus);

      expect(eventBus.events).toHaveLength(1);
      const event = eventBus.events[0] as TaskStatusUpdateEvent;
      expect(event.kind).toBe('status-update');
      expect(event.status.state).toBe('canceled');
      expect(event.final).toBe(true);
    });
  });
});

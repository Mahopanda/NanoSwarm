import { describe, it, expect, mock } from 'bun:test';
import { GatewayExecutor } from '../../src/gateway/executor.ts';
import type { InvokeAgentFn } from '../../src/types.ts';
import type {
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  Message,
} from '@a2a-js/sdk';
import type { RequestContext, ExecutionEventBus } from '@a2a-js/sdk/server';

function createMockInvokeAgent(result = { text: 'Hello from agent' }): InvokeAgentFn {
  return mock(async () => result) as InvokeAgentFn;
}

function createFailingInvokeAgent(errorMessage: string): InvokeAgentFn {
  return mock(async () => { throw new Error(errorMessage); }) as InvokeAgentFn;
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

describe('GatewayExecutor', () => {
  describe('execute', () => {
    it('should publish Task → working → artifact → completed for new task', async () => {
      const invokeAgent = createMockInvokeAgent();
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);
      const ctx = createMockRequestContext();

      await executor.execute(ctx, eventBus);

      expect(eventBus.events).toHaveLength(4);

      expect(eventBus.events[0].kind).toBe('task');
      expect(eventBus.events[0].id).toBe('task-1');
      expect(eventBus.events[0].status.state).toBe('submitted');

      expect(eventBus.events[1].kind).toBe('status-update');
      expect((eventBus.events[1] as TaskStatusUpdateEvent).status.state).toBe('working');
      expect((eventBus.events[1] as TaskStatusUpdateEvent).final).toBe(false);

      expect(eventBus.events[2].kind).toBe('artifact-update');
      expect((eventBus.events[2] as TaskArtifactUpdateEvent).artifact.parts[0]).toEqual({
        kind: 'text',
        text: 'Hello from agent',
      });
      expect((eventBus.events[2] as TaskArtifactUpdateEvent).lastChunk).toBe(true);

      expect(eventBus.events[3].kind).toBe('status-update');
      expect((eventBus.events[3] as TaskStatusUpdateEvent).status.state).toBe('completed');
      expect((eventBus.events[3] as TaskStatusUpdateEvent).final).toBe(true);
    });

    it('should skip initial Task event for existing task', async () => {
      const invokeAgent = createMockInvokeAgent();
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);

      const existingTask: Task = {
        kind: 'task',
        id: 'task-1',
        contextId: 'ctx-1',
        status: { state: 'working' },
      };

      const ctx = createMockRequestContext({ existingTask });
      await executor.execute(ctx, eventBus);

      expect(eventBus.events).toHaveLength(3);
      expect(eventBus.events[0].kind).toBe('status-update');
    });

    it('should extract text from message parts', async () => {
      const invokeAgent = createMockInvokeAgent();
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);
      const ctx = createMockRequestContext({ text: 'Test message' });

      await executor.execute(ctx, eventBus);

      expect(invokeAgent).toHaveBeenCalledWith(undefined, 'ctx-1', 'Test message', undefined);
    });

    it('should convert history from existing task', async () => {
      const invokeAgent = createMockInvokeAgent();
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);

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

      expect(invokeAgent).toHaveBeenCalledWith(undefined, 'ctx-1', 'Hello', [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' },
      ]);
    });

    it('should publish failed status on error', async () => {
      const invokeAgent = createFailingInvokeAgent('LLM failed');
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);
      const ctx = createMockRequestContext();

      await executor.execute(ctx, eventBus);

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
      const invokeAgent = createMockInvokeAgent();
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);

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

      expect(invokeAgent).toHaveBeenCalledWith(undefined, 'ctx-1', '', undefined);
    });
  });

  describe('agent routing', () => {
    it('should route to specific agent when message has agentId metadata', async () => {
      const invokeAgent = mock(async (_agentId: string | undefined) => ({ text: 'Routed response' })) as unknown as InvokeAgentFn;
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);
      const message: Message = {
        kind: 'message',
        messageId: 'msg-1',
        role: 'user',
        parts: [{ kind: 'text', text: 'Hello' }],
        contextId: 'ctx-1',
        taskId: 'task-1',
        metadata: { agentId: 'writer' },
      } as any;
      const ctx = {
        userMessage: message,
        taskId: 'task-1',
        contextId: 'ctx-1',
        task: undefined,
      } as unknown as RequestContext;

      await executor.execute(ctx, eventBus);

      expect(invokeAgent).toHaveBeenCalledWith('writer', 'ctx-1', 'Hello', undefined);
      const artifact = eventBus.events.find((e: any) => e.kind === 'artifact-update');
      expect(artifact.artifact.parts[0].text).toBe('Routed response');
    });

    it('should pass undefined agentId when no metadata', async () => {
      const invokeAgent = createMockInvokeAgent();
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);
      const ctx = createMockRequestContext();

      await executor.execute(ctx, eventBus);

      expect(invokeAgent).toHaveBeenCalledWith(undefined, 'ctx-1', 'Hello', undefined);
    });

    it('should publish failed status when invokeAgent throws for unknown agent', async () => {
      const invokeAgent = createFailingInvokeAgent('Agent not found: ghost');
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);

      const message: Message = {
        kind: 'message',
        messageId: 'msg-1',
        role: 'user',
        parts: [{ kind: 'text', text: 'Hello' }],
        contextId: 'ctx-1',
        taskId: 'task-1',
        metadata: { agentId: 'ghost' },
      } as any;
      const ctx = {
        userMessage: message,
        taskId: 'task-1',
        contextId: 'ctx-1',
        task: undefined,
      } as unknown as RequestContext;

      await executor.execute(ctx, eventBus);

      const lastEvent = eventBus.events[eventBus.events.length - 1] as TaskStatusUpdateEvent;
      expect(lastEvent.status.state).toBe('failed');
      expect(lastEvent.status.message?.parts[0]).toEqual({
        kind: 'text',
        text: 'Agent not found: ghost',
      });
    });
  });

  describe('cancelTask', () => {
    it('should publish canceled status', async () => {
      const invokeAgent = createMockInvokeAgent();
      const eventBus = createMockEventBus();
      const executor = new GatewayExecutor(invokeAgent);

      await executor.cancelTask('task-1', eventBus);

      expect(eventBus.events).toHaveLength(1);
      const event = eventBus.events[0] as TaskStatusUpdateEvent;
      expect(event.kind).toBe('status-update');
      expect(event.status.state).toBe('canceled');
      expect(event.final).toBe(true);
    });
  });
});

import type {
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  Message,
} from '@a2a-js/sdk';
import type {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from '@a2a-js/sdk/server';
import type { AgentRegistry } from '../registry.ts';
import { A2ARouter } from '../router.ts';

export class GatewayExecutor implements AgentExecutor {
  private router: A2ARouter;

  constructor(private registry: AgentRegistry) {
    this.router = new A2ARouter(registry);
  }

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { userMessage, taskId, contextId, task: existingTask } = requestContext;

    const text = this.extractText(userMessage);

    try {
      // 1. Publish initial Task event if new task
      if (!existingTask) {
        const initialTask: Task = {
          kind: 'task',
          id: taskId,
          contextId,
          status: {
            state: 'submitted',
            timestamp: new Date().toISOString(),
          },
          history: [userMessage],
        };
        eventBus.publish(initialTask);
      }

      // 2. Publish working status
      const workingUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'working',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: crypto.randomUUID(),
            parts: [{ kind: 'text', text: 'Processing...' }],
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: false,
      };
      eventBus.publish(workingUpdate);

      // 3. Convert A2A history to agent format
      const history = this.convertHistory(existingTask);

      // 4. Resolve handler via router (supports agentId routing)
      const agentId = this.extractAgentId(userMessage);
      const handler = this.router.resolve(agentId);

      // 5. Call agent handler
      const result = await handler.chat(contextId, text, history);

      // 6. Publish artifact
      const artifactUpdate: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId,
        contextId,
        artifact: {
          artifactId: crypto.randomUUID(),
          name: 'response',
          parts: [{ kind: 'text', text: result.text }],
        },
        lastChunk: true,
      };
      eventBus.publish(artifactUpdate);

      // 7. Publish completed status
      const completedUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'completed',
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(completedUpdate);
    } catch (error) {
      const failedUpdate: TaskStatusUpdateEvent = {
        kind: 'status-update',
        taskId,
        contextId,
        status: {
          state: 'failed',
          message: {
            kind: 'message',
            role: 'agent',
            messageId: crypto.randomUUID(),
            parts: [{
              kind: 'text',
              text: error instanceof Error ? error.message : 'Unknown error',
            }],
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: true,
      };
      eventBus.publish(failedUpdate);
    }
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    const canceledUpdate: TaskStatusUpdateEvent = {
      kind: 'status-update',
      taskId,
      contextId: '',
      status: {
        state: 'canceled',
        timestamp: new Date().toISOString(),
      },
      final: true,
    };
    eventBus.publish(canceledUpdate);
  }

  private extractAgentId(message: Message): string | undefined {
    return (message as any).metadata?.agentId as string | undefined;
  }

  private extractText(message: Message): string {
    for (const part of message.parts) {
      if (part.kind === 'text') {
        return part.text;
      }
    }
    return '';
  }

  private convertHistory(
    task: Task | undefined,
  ): Array<{ role: 'user' | 'assistant'; content: string }> | undefined {
    if (!task?.history || task.history.length === 0) return undefined;

    return task.history.map((msg) => ({
      role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
      content: this.extractText(msg),
    }));
  }
}

import express from 'express';
import type {
  AgentCard,
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
import {
  InMemoryTaskStore,
  DefaultRequestHandler,
} from '@a2a-js/sdk/server';
import {
  agentCardHandler,
  jsonRpcHandler,
  UserBuilder,
} from '@a2a-js/sdk/server/express';
import { AGENT_CARD_PATH } from '@a2a-js/sdk';

export interface Product {
  name: string;
  price: number;
  currency: string;
  rating: number;
  description: string;
}

export type SearchHandler = (query: string) => Product[];

class MockExecutor implements AgentExecutor {
  constructor(private searchHandler: SearchHandler) {}

  async execute(requestContext: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const { userMessage, taskId, contextId, task: existingTask } = requestContext;
    const query = this.extractText(userMessage);

    try {
      // Publish initial Task if new
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

      // Working status
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
            parts: [{ kind: 'text', text: 'Searching products...' }],
            taskId,
            contextId,
          },
          timestamp: new Date().toISOString(),
        },
        final: false,
      };
      eventBus.publish(workingUpdate);

      // Search
      const results = this.searchHandler(query);
      const responseText = results.length > 0
        ? JSON.stringify(results, null, 2)
        : JSON.stringify({ message: 'No products found matching your query.' });

      // Artifact
      const artifactUpdate: TaskArtifactUpdateEvent = {
        kind: 'artifact-update',
        taskId,
        contextId,
        artifact: {
          artifactId: crypto.randomUUID(),
          name: 'search-results',
          parts: [{ kind: 'text', text: responseText }],
        },
        lastChunk: true,
      };
      eventBus.publish(artifactUpdate);

      // Completed
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

  private extractText(message: Message): string {
    for (const part of message.parts) {
      if (part.kind === 'text') {
        return part.text;
      }
    }
    return '';
  }
}

export interface MockServerOptions {
  card: AgentCard;
  searchHandler: SearchHandler;
  port: number;
}

export function startMockServer(options: MockServerOptions): void {
  const { card, searchHandler, port } = options;

  const taskStore = new InMemoryTaskStore();
  const executor = new MockExecutor(searchHandler);
  const requestHandler = new DefaultRequestHandler(card, taskStore, executor);

  const app = express();

  // Health
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', name: card.name });
  });

  // Agent Card
  app.use(
    `/${AGENT_CARD_PATH}`,
    agentCardHandler({ agentCardProvider: requestHandler }),
  );

  // JSON-RPC
  app.use(
    '/a2a/jsonrpc',
    jsonRpcHandler({ requestHandler, userBuilder: UserBuilder.noAuthentication }),
  );

  app.listen(port, '0.0.0.0', () => {
    console.log(`[${card.name}] Mock A2A server running on http://0.0.0.0:${port}`);
    console.log(`[${card.name}] Agent Card: http://0.0.0.0:${port}/.well-known/agent-card.json`);
    console.log(`[${card.name}] JSON-RPC: http://0.0.0.0:${port}/a2a/jsonrpc`);
  });
}

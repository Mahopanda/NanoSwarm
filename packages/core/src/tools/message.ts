import { z } from 'zod';
import type { NanoTool } from './base.ts';
import type { EventBus } from '../events/event-bus.ts';

export function createMessageTool(eventBus: EventBus): NanoTool {
  return {
    name: 'message',
    description: 'Send an intermediate message to the user during processing.',
    parameters: z.object({
      content: z.string().describe('The message content to send to the user'),
    }),
    execute: async (params, context) => {
      eventBus.emit('message', {
        role: 'agent',
        content: params.content,
        contextId: context.contextId,
      });
      return 'Message sent';
    },
  };
}

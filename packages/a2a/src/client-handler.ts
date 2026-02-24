import { ClientFactory } from '@a2a-js/sdk/client';
import type { Message, Task } from '@a2a-js/sdk';
import type { AgentHandler } from './types.ts';

export class A2AClientHandler implements AgentHandler {
  private factory = new ClientFactory();

  constructor(private baseUrl: string) {}

  async chat(contextId: string, text: string): Promise<{ text: string }> {
    const client = await this.factory.createFromUrl(this.baseUrl);
    const result = await client.sendMessage({
      message: {
        kind: 'message',
        role: 'user',
        messageId: crypto.randomUUID(),
        parts: [{ kind: 'text', text }],
        contextId,
      },
    });
    return { text: extractTextFromResult(result) };
  }
}

export function extractTextFromResult(result: Message | Task): string {
  if (result.kind === 'message') {
    return extractTextFromParts(result.parts);
  }
  // Task — try status message first, then last history entry
  if (result.status?.message) {
    return extractTextFromParts(result.status.message.parts);
  }
  if (result.history && result.history.length > 0) {
    const last = result.history[result.history.length - 1];
    return extractTextFromParts(last.parts);
  }
  return `Task ${result.id} (${result.status.state})`;
}

function extractTextFromParts(parts: Array<{ kind: string; [key: string]: unknown }>): string {
  const texts: string[] = [];
  for (const part of parts) {
    if (part.kind === 'text' && typeof part.text === 'string') {
      texts.push(part.text);
    }
  }
  return texts.join('\n') || '';
}

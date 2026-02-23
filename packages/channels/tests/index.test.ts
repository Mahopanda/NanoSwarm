import { describe, it, expect } from 'bun:test';
import { createRestRouter } from '../src/index.ts';
import type {
  NormalizedMessage,
  NormalizedResponse,
  MessageHandler,
  Channel,
  Attachment,
} from '../src/index.ts';

describe('channels barrel export', () => {
  it('should export createRestRouter', () => {
    expect(createRestRouter).toBeInstanceOf(Function);
  });

  it('should export types (compile-time check)', () => {
    // Type-level check: these should compile without error
    const _msg: NormalizedMessage = {
      channelId: 'rest',
      userId: 'u1',
      conversationId: 'c1',
      text: 'hello',
    };
    const _res: NormalizedResponse = { text: 'hi' };
    const _handler: MessageHandler = { handle: async () => _res };
    const _channel: Channel = { id: 'rest', name: 'REST' };
    const _attachment: Attachment = { name: 'f', mimeType: 'text/plain', data: '' };

    expect(true).toBe(true);
  });
});

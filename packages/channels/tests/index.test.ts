import { describe, it, expect } from 'bun:test';
import {
  createRestRouter,
  AsyncQueue,
  MessageBus,
  sessionKey,
  BaseChannel,
  ChannelManager,
  CLIChannel,
  TelegramChannel,
  markdownToTelegramHtml,
  splitMessage,
} from '../src/index.ts';
import type {
  NormalizedMessage,
  NormalizedResponse,
  MessageHandler,
  Channel,
  Attachment,
  InboundMessage,
  OutboundMessage,
  ChannelConfig,
  CLIChannelConfig,
  TelegramChannelConfig,
} from '../src/index.ts';

describe('channels barrel export', () => {
  it('should export createRestRouter', () => {
    expect(createRestRouter).toBeInstanceOf(Function);
  });

  it('should export bus classes', () => {
    expect(AsyncQueue).toBeInstanceOf(Function);
    expect(MessageBus).toBeInstanceOf(Function);
    expect(sessionKey).toBeInstanceOf(Function);
  });

  it('should export channel classes', () => {
    expect(BaseChannel).toBeInstanceOf(Function);
    expect(ChannelManager).toBeInstanceOf(Function);
    expect(CLIChannel).toBeInstanceOf(Function);
    expect(TelegramChannel).toBeInstanceOf(Function);
  });

  it('should export telegram utilities', () => {
    expect(markdownToTelegramHtml).toBeInstanceOf(Function);
    expect(splitMessage).toBeInstanceOf(Function);
  });

  it('should export types (compile-time check)', () => {
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
    const _inbound: InboundMessage = {
      channel: 'test', senderId: 'u', chatId: 'c',
      content: 'hi', timestamp: new Date(), media: [], metadata: {},
    };
    const _outbound: OutboundMessage = {
      channel: 'test', chatId: 'c', content: 'hi', media: [], metadata: {},
    };
    const _chConfig: ChannelConfig = { enabled: true };
    const _cliConfig: CLIChannelConfig = { enabled: true };
    const _tgConfig: TelegramChannelConfig = { enabled: true, token: 'x' };

    expect(true).toBe(true);
  });
});

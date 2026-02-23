import { describe, it, expect } from 'bun:test';
import { TelegramChannel } from '../../src/telegram/channel.ts';
import { MessageBus } from '../../src/bus.ts';

describe('TelegramChannel', () => {
  it('should have name "telegram"', () => {
    const bus = new MessageBus();
    const ch = new TelegramChannel(
      { enabled: true, token: 'fake-token' },
      bus,
    );
    expect(ch.name).toBe('telegram');
  });

  it('should not be running before start', () => {
    const bus = new MessageBus();
    const ch = new TelegramChannel(
      { enabled: true, token: 'fake-token' },
      bus,
    );
    expect(ch.isRunning).toBe(false);
  });

  it('should handle send when bot is not started (no crash)', async () => {
    const bus = new MessageBus();
    const ch = new TelegramChannel(
      { enabled: true, token: 'fake-token' },
      bus,
    );
    // send() before start() should not throw
    await ch.send({
      channel: 'telegram',
      chatId: '12345',
      content: 'test',
      media: [],
      metadata: {},
    });
  });

  it('should support config with optional fields', () => {
    const bus = new MessageBus();
    const ch = new TelegramChannel(
      {
        enabled: true,
        token: 'fake-token',
        replyToMessage: true,
        allowFrom: ['alice'],
      },
      bus,
    );
    expect(ch.name).toBe('telegram');
  });
});

import { describe, it, expect } from 'bun:test';
import { BaseChannel, type ChannelConfig } from '../src/base-channel.ts';
import { MessageBus } from '../src/bus.ts';
import type { OutboundMessage } from '../src/messages.ts';

class TestChannel extends BaseChannel {
  readonly name = 'test';
  public sent: OutboundMessage[] = [];

  async start(): Promise<void> {
    this.running = true;
  }
  async stop(): Promise<void> {
    this.running = false;
  }
  async send(msg: OutboundMessage): Promise<void> {
    this.sent.push(msg);
  }

  // Expose protected methods for testing
  testIsAllowed(senderId: string): boolean {
    return this.isAllowed(senderId);
  }
  async testHandleMessage(params: Parameters<BaseChannel['handleMessage']>[0]) {
    return this.handleMessage(params);
  }
}

describe('BaseChannel ACL', () => {
  it('should allow all when allowFrom is empty', () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true }, bus);
    expect(ch.testIsAllowed('anyone')).toBe(true);
  });

  it('should allow all when allowFrom is undefined', () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true, allowFrom: undefined }, bus);
    expect(ch.testIsAllowed('anyone')).toBe(true);
  });

  it('should allow listed sender', () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true, allowFrom: ['alice', 'bob'] }, bus);
    expect(ch.testIsAllowed('alice')).toBe(true);
    expect(ch.testIsAllowed('bob')).toBe(true);
  });

  it('should reject unlisted sender', () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true, allowFrom: ['alice'] }, bus);
    expect(ch.testIsAllowed('eve')).toBe(false);
  });

  it('should support pipe-separated compound IDs', () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true, allowFrom: ['bob'] }, bus);
    expect(ch.testIsAllowed('123|bob')).toBe(true);
    expect(ch.testIsAllowed('123|eve')).toBe(false);
  });
});

describe('BaseChannel handleMessage', () => {
  it('should publish to bus when allowed', async () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true }, bus);

    await ch.testHandleMessage({
      senderId: 'user1',
      chatId: 'chat1',
      content: 'hello',
    });

    expect(bus.inboundSize).toBe(1);
    const msg = await bus.consumeInbound();
    expect(msg.channel).toBe('test');
    expect(msg.senderId).toBe('user1');
    expect(msg.chatId).toBe('chat1');
    expect(msg.content).toBe('hello');
    expect(msg.media).toEqual([]);
    expect(msg.metadata).toEqual({});
    expect(msg.timestamp).toBeInstanceOf(Date);
  });

  it('should not publish to bus when sender is rejected', async () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true, allowFrom: ['alice'] }, bus);

    await ch.testHandleMessage({
      senderId: 'eve',
      chatId: 'chat1',
      content: 'hack',
    });

    expect(bus.inboundSize).toBe(0);
  });

  it('should pass media and metadata through', async () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true }, bus);

    await ch.testHandleMessage({
      senderId: 'user1',
      chatId: 'chat1',
      content: 'with media',
      media: ['/path/to/file.png'],
      metadata: { key: 'value' },
    });

    const msg = await bus.consumeInbound();
    expect(msg.media).toEqual(['/path/to/file.png']);
    expect(msg.metadata).toEqual({ key: 'value' });
  });
});

describe('BaseChannel lifecycle', () => {
  it('should track running state', async () => {
    const bus = new MessageBus();
    const ch = new TestChannel({ enabled: true }, bus);
    expect(ch.isRunning).toBe(false);
    await ch.start();
    expect(ch.isRunning).toBe(true);
    await ch.stop();
    expect(ch.isRunning).toBe(false);
  });
});

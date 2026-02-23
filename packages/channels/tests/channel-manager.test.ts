import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ChannelManager } from '../src/channel-manager.ts';
import { MessageBus } from '../src/bus.ts';
import { BaseChannel, type ChannelConfig } from '../src/base-channel.ts';
import type { OutboundMessage } from '../src/messages.ts';

class MockChannel extends BaseChannel {
  readonly name: string;
  public sent: OutboundMessage[] = [];

  constructor(name: string, config: ChannelConfig, bus: MessageBus) {
    super(config, bus);
    this.name = name;
  }

  async start(): Promise<void> {
    this.running = true;
  }
  async stop(): Promise<void> {
    this.running = false;
  }
  async send(msg: OutboundMessage): Promise<void> {
    this.sent.push(msg);
  }
}

describe('ChannelManager', () => {
  let bus: MessageBus;
  let manager: ChannelManager;

  beforeEach(() => {
    bus = new MessageBus();
    manager = new ChannelManager(bus);
  });

  afterEach(async () => {
    await manager.stopAll();
  });

  it('should register and retrieve channels', () => {
    const ch = new MockChannel('test', { enabled: true }, bus);
    manager.register(ch);
    expect(manager.getChannel('test')).toBe(ch);
    expect(manager.getChannel('nonexistent')).toBeUndefined();
  });

  it('should start and stop all channels', async () => {
    const ch1 = new MockChannel('ch1', { enabled: true }, bus);
    const ch2 = new MockChannel('ch2', { enabled: true }, bus);
    manager.register(ch1);
    manager.register(ch2);

    await manager.startAll();
    expect(ch1.isRunning).toBe(true);
    expect(ch2.isRunning).toBe(true);

    await manager.stopAll();
    expect(ch1.isRunning).toBe(false);
    expect(ch2.isRunning).toBe(false);
  });

  it('should dispatch outbound messages to correct channel', async () => {
    const ch1 = new MockChannel('ch1', { enabled: true }, bus);
    const ch2 = new MockChannel('ch2', { enabled: true }, bus);
    manager.register(ch1);
    manager.register(ch2);

    await manager.startAll();

    bus.publishOutbound({
      channel: 'ch2',
      chatId: 'chat1',
      content: 'hello ch2',
      media: [],
      metadata: {},
    });

    // Wait for dispatch loop to process
    await new Promise((r) => setTimeout(r, 50));

    expect(ch1.sent).toHaveLength(0);
    expect(ch2.sent).toHaveLength(1);
    expect(ch2.sent[0].content).toBe('hello ch2');
  });

  it('should handle unknown channel gracefully', async () => {
    await manager.startAll();

    // Should not throw
    bus.publishOutbound({
      channel: 'nonexistent',
      chatId: 'chat1',
      content: 'lost message',
      media: [],
      metadata: {},
    });

    await new Promise((r) => setTimeout(r, 50));
    // No crash = pass
  });

  it('should report status of all channels', async () => {
    const ch1 = new MockChannel('ch1', { enabled: true }, bus);
    const ch2 = new MockChannel('ch2', { enabled: true }, bus);
    manager.register(ch1);
    manager.register(ch2);

    const statusBefore = manager.getStatus();
    expect(statusBefore).toEqual({
      ch1: { enabled: true, running: false },
      ch2: { enabled: true, running: false },
    });

    await manager.startAll();

    const statusAfter = manager.getStatus();
    expect(statusAfter).toEqual({
      ch1: { enabled: true, running: true },
      ch2: { enabled: true, running: true },
    });
  });
});

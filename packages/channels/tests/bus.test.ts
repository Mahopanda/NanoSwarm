import { describe, it, expect } from 'bun:test';
import { AsyncQueue, MessageBus } from '../src/bus.ts';
import type { InboundMessage, OutboundMessage } from '../src/messages.ts';

describe('AsyncQueue', () => {
  it('should dequeue immediately when items are available', async () => {
    const q = new AsyncQueue<number>();
    q.enqueue(1);
    q.enqueue(2);
    expect(await q.dequeue()).toBe(1);
    expect(await q.dequeue()).toBe(2);
  });

  it('should block dequeue until item is enqueued', async () => {
    const q = new AsyncQueue<number>();
    const promise = q.dequeue();
    // Not yet resolved
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    await Promise.resolve(); // tick
    expect(resolved).toBe(false);

    q.enqueue(42);
    expect(await promise).toBe(42);
  });

  it('should maintain FIFO order', async () => {
    const q = new AsyncQueue<string>();
    q.enqueue('a');
    q.enqueue('b');
    q.enqueue('c');
    expect(await q.dequeue()).toBe('a');
    expect(await q.dequeue()).toBe('b');
    expect(await q.dequeue()).toBe('c');
  });

  it('should report correct size', () => {
    const q = new AsyncQueue<number>();
    expect(q.size).toBe(0);
    q.enqueue(1);
    q.enqueue(2);
    expect(q.size).toBe(2);
  });

  it('should resolve multiple waiting dequeuers in order', async () => {
    const q = new AsyncQueue<number>();
    const p1 = q.dequeue();
    const p2 = q.dequeue();
    q.enqueue(10);
    q.enqueue(20);
    expect(await p1).toBe(10);
    expect(await p2).toBe(20);
  });
});

function makeInbound(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    channel: 'test',
    senderId: 'user1',
    chatId: 'chat1',
    content: 'hello',
    timestamp: new Date(),
    media: [],
    metadata: {},
    ...overrides,
  };
}

function makeOutbound(overrides: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    channel: 'test',
    chatId: 'chat1',
    content: 'reply',
    media: [],
    metadata: {},
    ...overrides,
  };
}

describe('MessageBus', () => {
  it('should publish and consume inbound messages', async () => {
    const bus = new MessageBus();
    const msg = makeInbound({ content: 'hi' });
    bus.publishInbound(msg);
    expect(await bus.consumeInbound()).toBe(msg);
  });

  it('should publish and consume outbound messages', async () => {
    const bus = new MessageBus();
    const msg = makeOutbound({ content: 'bye' });
    bus.publishOutbound(msg);
    expect(await bus.consumeOutbound()).toBe(msg);
  });

  it('should block consume until message is published', async () => {
    const bus = new MessageBus();
    const promise = bus.consumeInbound();
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);

    const msg = makeInbound();
    bus.publishInbound(msg);
    expect(await promise).toBe(msg);
  });

  it('should report correct sizes', () => {
    const bus = new MessageBus();
    expect(bus.inboundSize).toBe(0);
    expect(bus.outboundSize).toBe(0);

    bus.publishInbound(makeInbound());
    bus.publishOutbound(makeOutbound());
    bus.publishOutbound(makeOutbound());

    expect(bus.inboundSize).toBe(1);
    expect(bus.outboundSize).toBe(2);
  });

  it('should handle concurrent producers and consumers', async () => {
    const bus = new MessageBus();
    const results: string[] = [];

    // Start 3 consumers before any publish
    const p1 = bus.consumeInbound().then((m) => results.push(m.content));
    const p2 = bus.consumeInbound().then((m) => results.push(m.content));
    const p3 = bus.consumeInbound().then((m) => results.push(m.content));

    bus.publishInbound(makeInbound({ content: 'a' }));
    bus.publishInbound(makeInbound({ content: 'b' }));
    bus.publishInbound(makeInbound({ content: 'c' }));

    await Promise.all([p1, p2, p3]);
    expect(results).toEqual(['a', 'b', 'c']);
  });
});

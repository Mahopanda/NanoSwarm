import type { InboundMessage, OutboundMessage } from './messages.ts';

export class AsyncQueue<T> {
  private queue: T[] = [];
  private waiters: Array<{ resolve: (value: T) => void }> = [];

  enqueue(item: T): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(item);
    } else {
      this.queue.push(item);
    }
  }

  dequeue(): Promise<T> {
    const item = this.queue.shift();
    if (item !== undefined) {
      return Promise.resolve(item);
    }
    return new Promise<T>((resolve) => {
      this.waiters.push({ resolve });
    });
  }

  get size(): number {
    return this.queue.length;
  }
}

export class MessageBus {
  private inbound = new AsyncQueue<InboundMessage>();
  private outbound = new AsyncQueue<OutboundMessage>();

  publishInbound(msg: InboundMessage): void {
    this.inbound.enqueue(msg);
  }

  consumeInbound(): Promise<InboundMessage> {
    return this.inbound.dequeue();
  }

  publishOutbound(msg: OutboundMessage): void {
    this.outbound.enqueue(msg);
  }

  consumeOutbound(): Promise<OutboundMessage> {
    return this.outbound.dequeue();
  }

  get inboundSize(): number {
    return this.inbound.size;
  }

  get outboundSize(): number {
    return this.outbound.size;
  }
}

import type { MessageBus } from './bus.ts';
import type { BaseChannel } from './base-channel.ts';

export class ChannelManager {
  private channels = new Map<string, BaseChannel>();
  private abortController: AbortController | null = null;

  constructor(private bus: MessageBus) {}

  register(channel: BaseChannel): void {
    this.channels.set(channel.name, channel);
  }

  getChannel(name: string): BaseChannel | undefined {
    return this.channels.get(name);
  }

  getStatus(): Record<string, { enabled: boolean; running: boolean }> {
    const result: Record<string, { enabled: boolean; running: boolean }> = {};
    for (const [name, ch] of this.channels) {
      result[name] = { enabled: true, running: ch.isRunning };
    }
    return result;
  }

  async startAll(): Promise<void> {
    this.abortController = new AbortController();
    this.dispatchOutbound(this.abortController.signal);

    await Promise.all(
      Array.from(this.channels.values()).map((ch) => ch.start()),
    );
  }

  async stopAll(): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;

    await Promise.all(
      Array.from(this.channels.values()).map((ch) => ch.stop()),
    );
  }

  private async dispatchOutbound(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const msg = await this.bus.consumeOutbound();
      if (signal.aborted) break;

      const channel = this.channels.get(msg.channel);
      if (channel) {
        try {
          await channel.send(msg);
        } catch (err) {
          console.error(`[ChannelManager] Error sending to ${msg.channel}:`, err);
        }
      } else {
        console.warn(`[ChannelManager] Unknown channel: ${msg.channel}`);
      }
    }
  }
}

import type { MessageBus } from './bus.ts';
import type { InboundMessage, OutboundMessage } from './messages.ts';

export interface ChannelConfig {
  enabled: boolean;
  allowFrom?: string[];
}

export abstract class BaseChannel {
  abstract readonly name: string;
  protected running = false;

  constructor(
    protected config: ChannelConfig,
    protected bus: MessageBus,
  ) {}

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  abstract send(msg: OutboundMessage): Promise<void>;

  get isRunning(): boolean {
    return this.running;
  }

  protected isAllowed(senderId: string): boolean {
    if (!this.config.allowFrom || this.config.allowFrom.length === 0) {
      return true;
    }
    const ids = senderId.split('|');
    return ids.some((id) => this.config.allowFrom!.includes(id));
  }

  protected async handleMessage(params: {
    senderId: string;
    chatId: string;
    content: string;
    media?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.isAllowed(params.senderId)) {
      return;
    }
    const msg: InboundMessage = {
      channel: this.name,
      senderId: params.senderId,
      chatId: params.chatId,
      content: params.content,
      timestamp: new Date(),
      media: params.media ?? [],
      metadata: params.metadata ?? {},
    };
    this.bus.publishInbound(msg);
  }
}

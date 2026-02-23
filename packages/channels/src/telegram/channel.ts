import { Bot, type Context } from 'grammy';
import { BaseChannel, type ChannelConfig } from '../base-channel.ts';
import type { MessageBus } from '../bus.ts';
import type { OutboundMessage } from '../messages.ts';
import { markdownToTelegramHtml, splitMessage } from './format.ts';

export interface TelegramChannelConfig extends ChannelConfig {
  token: string;
  proxy?: string;
  replyToMessage?: boolean;
  sttProvider?: 'groq' | 'whisper';
  sttApiKey?: string;
}

export class TelegramChannel extends BaseChannel {
  readonly name = 'telegram';
  private bot: Bot | null = null;
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    protected override config: TelegramChannelConfig,
    bus: MessageBus,
  ) {
    super(config, bus);
  }

  async start(): Promise<void> {
    this.bot = new Bot(this.config.token);

    this.bot.command('start', (ctx) => this.onStart(ctx));
    this.bot.command('new', (ctx) => this.onNew(ctx));
    this.bot.command('help', (ctx) => this.onHelp(ctx));
    this.bot.on('message', (ctx) => this.onMessage(ctx));

    this.bot.start();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const interval of this.typingIntervals.values()) {
      clearInterval(interval);
    }
    this.typingIntervals.clear();
    await this.bot?.stop();
    this.bot = null;
  }

  async send(msg: OutboundMessage): Promise<void> {
    if (!this.bot) return;
    const chatId = msg.chatId;

    // Stop typing indicator for this chat
    this.stopTyping(chatId);

    // Send media files if any
    for (const mediaPath of msg.media) {
      try {
        await this.bot.api.sendDocument(chatId, mediaPath);
      } catch {
        // Ignore media send errors
      }
    }

    // Convert and split content
    const htmlContent = markdownToTelegramHtml(msg.content);
    const chunks = splitMessage(htmlContent);

    for (const chunk of chunks) {
      try {
        await this.bot.api.sendMessage(chatId, chunk, {
          parse_mode: 'HTML',
          ...(msg.replyTo ? { reply_parameters: { message_id: Number(msg.replyTo) } } : {}),
        });
      } catch {
        // Fallback to plain text if HTML fails
        try {
          await this.bot.api.sendMessage(chatId, msg.content);
        } catch {
          // Give up on this chunk
        }
      }
    }
  }

  private async onStart(ctx: Context): Promise<void> {
    await ctx.reply(
      'Welcome to NanoSwarm! Send me a message to start chatting.\n\n'
      + 'Commands:\n'
      + '/new - Start a new conversation\n'
      + '/help - Show this help message',
    );
  }

  private async onNew(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id ?? '');
    await this.handleMessage({
      senderId: this.extractSenderId(ctx),
      chatId,
      content: '/new',
      metadata: { command: 'new' },
    });
    await ctx.reply('New conversation started.');
  }

  private async onHelp(ctx: Context): Promise<void> {
    await ctx.reply(
      'NanoSwarm Bot\n\n'
      + 'Send any text message to chat with the agent.\n\n'
      + 'Commands:\n'
      + '/new - Start a new conversation\n'
      + '/help - Show help',
    );
  }

  private async onMessage(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id ?? '');
    const senderId = this.extractSenderId(ctx);
    const text = ctx.message?.text ?? '';

    if (!text) return;

    // Start typing indicator
    this.startTyping(chatId);

    await this.handleMessage({
      senderId,
      chatId,
      content: text,
      metadata: {
        messageId: ctx.message?.message_id,
      },
    });
  }

  private extractSenderId(ctx: Context): string {
    const user = ctx.from;
    if (!user) return 'unknown';
    return user.username ? `${user.id}|${user.username}` : String(user.id);
  }

  private startTyping(chatId: string): void {
    this.stopTyping(chatId);
    const send = () => {
      this.bot?.api.sendChatAction(chatId, 'typing').catch(() => {});
    };
    send();
    this.typingIntervals.set(chatId, setInterval(send, 4000));
  }

  private stopTyping(chatId: string): void {
    const interval = this.typingIntervals.get(chatId);
    if (interval) {
      clearInterval(interval);
      this.typingIntervals.delete(chatId);
    }
  }
}

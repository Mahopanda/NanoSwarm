import { Bot, type Context } from 'grammy';
import { BaseChannel, type ChannelConfig } from '../base-channel.ts';
import type { MessageBus } from '../bus.ts';
import type { OutboundMessage } from '../messages.ts';
import type { AdminProvider } from '../admin.ts';
import { markdownToTelegramHtml, splitMessage } from './format.ts';

export interface TelegramChannelConfig extends ChannelConfig {
  token: string;
  proxy?: string;
  replyToMessage?: boolean;
  sttProvider?: 'groq' | 'whisper';
  sttApiKey?: string;
  adminUsers?: string[];
}

export class TelegramChannel extends BaseChannel {
  readonly name = 'telegram';
  private bot: Bot | null = null;
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private adminProvider: AdminProvider | null = null;

  constructor(
    protected override config: TelegramChannelConfig,
    bus: MessageBus,
  ) {
    super(config, bus);
  }

  setAdminProvider(provider: AdminProvider): void {
    this.adminProvider = provider;
  }

  async start(): Promise<void> {
    this.bot = new Bot(this.config.token);

    this.bot.command('start', (ctx) => this.onStart(ctx));
    this.bot.command('new', (ctx) => this.onNew(ctx));
    this.bot.command('help', (ctx) => this.onHelp(ctx));
    this.bot.command('status', (ctx) => this.onStatus(ctx));
    this.bot.command('cancel', (ctx) => this.onCancel(ctx));
    this.bot.command('logs', (ctx) => this.onLogs(ctx));
    this.bot.command('restart', (ctx) => this.onRestart(ctx));
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

  private isAdmin(ctx: Context): boolean {
    const adminList = this.config.adminUsers ?? this.config.allowFrom ?? [];
    if (adminList.length === 0) return false;
    const senderId = this.extractSenderId(ctx);
    const ids = senderId.split('|');
    return ids.some((id) => adminList.includes(id));
  }

  private async onStart(ctx: Context): Promise<void> {
    await ctx.reply(
      'Welcome to NanoSwarm! Send me a message to start chatting.\n\n'
      + 'Commands:\n'
      + '/new - Start a new conversation\n'
      + '/help - Show this help message\n\n'
      + 'Admin commands:\n'
      + '/status - System health (admin only)\n'
      + '/cancel [id] - Cancel a running task (admin only)\n'
      + '/logs [N|error] - View recent logs (admin only)\n'
      + '/restart - Restart the service (admin only)',
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
      + '/help - Show help\n\n'
      + 'Admin commands:\n'
      + '/status - System health (admin only)\n'
      + '/cancel [id] - Cancel a running task (admin only)\n'
      + '/logs [N|error] - View recent logs (admin only)\n'
      + '/restart - Restart the service (admin only)',
    );
  }

  private async onStatus(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) {
      await ctx.reply('Permission denied. Admin only.');
      return;
    }
    if (!this.adminProvider) {
      await ctx.reply('Admin provider not configured.');
      return;
    }

    const s = this.adminProvider.getStatus();
    const state = s.idle ? 'Idle' : `Processing (${s.processingSeconds}s, sender: ${s.currentSender})`;
    const upH = Math.floor(s.uptimeSeconds / 3600);
    const upM = Math.floor((s.uptimeSeconds % 3600) / 60);
    const lines = [
      `State: ${state}`,
      `Uptime: ${upH}h ${upM}m`,
      `Messages: ${s.messagesProcessed}`,
      `Errors: ${s.errorsCount}`,
      `Running agents: ${s.runningAgents.length}`,
    ];
    if (s.runningAgents.length > 0) {
      for (const a of s.runningAgents) {
        lines.push(`  - [${a.taskId}] ${a.label}`);
      }
    }
    lines.push(`Cron jobs: ${s.cronJobs}`);
    await ctx.reply(lines.join('\n'));
  }

  private async onCancel(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) {
      await ctx.reply('Permission denied. Admin only.');
      return;
    }
    if (!this.adminProvider) {
      await ctx.reply('Admin provider not configured.');
      return;
    }

    const text = ctx.message?.text ?? '';
    const taskId = text.replace(/^\/cancel\s*/, '').trim();

    if (!taskId) {
      const tasks = this.adminProvider.getRunningTasks();
      if (tasks.length === 0) {
        await ctx.reply('No running tasks.');
        return;
      }
      const lines = ['Running tasks:'];
      for (const t of tasks) {
        lines.push(`  - [${t.taskId}] ${t.label}`);
      }
      lines.push('\nUse /cancel <taskId> to cancel.');
      await ctx.reply(lines.join('\n'));
      return;
    }

    const ok = this.adminProvider.cancelTask(taskId);
    await ctx.reply(ok ? `Task ${taskId} cancelled.` : `Task ${taskId} not found.`);
  }

  private async onLogs(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) {
      await ctx.reply('Permission denied. Admin only.');
      return;
    }
    if (!this.adminProvider) {
      await ctx.reply('Admin provider not configured.');
      return;
    }

    const text = ctx.message?.text ?? '';
    const arg = text.replace(/^\/logs\s*/, '').trim();
    let logs: string[];

    if (arg === 'error') {
      logs = this.adminProvider.getRecentLogs(0, 'error');
    } else {
      const count = Math.min(Math.max(parseInt(arg, 10) || 50, 1), 200);
      logs = this.adminProvider.getRecentLogs(count);
    }

    if (logs.length === 0) {
      await ctx.reply('No logs.');
      return;
    }

    let output = `<pre>${this.escapeHtml(logs.join('\n'))}</pre>`;
    if (output.length > 4000) {
      output = output.slice(0, 3990) + '...</pre>';
    }

    try {
      await ctx.reply(output, { parse_mode: 'HTML' });
    } catch {
      await ctx.reply(logs.join('\n').slice(0, 4000));
    }
  }

  private async onRestart(ctx: Context): Promise<void> {
    if (!this.isAdmin(ctx)) {
      await ctx.reply('Permission denied. Admin only.');
      return;
    }
    await ctx.reply('Restarting service...');
    setTimeout(() => {
      process.kill(process.pid, 'SIGTERM');
    }, 500);
  }

  private async onMessage(ctx: Context): Promise<void> {
    const chatId = String(ctx.chat?.id ?? '');
    const senderId = this.extractSenderId(ctx);
    const text = ctx.message?.text ?? '';

    // Skip non-text messages (stickers, voice, photos, etc.)
    if (!text) {
      const msg = ctx.message;
      if (msg && ('sticker' in msg || 'voice' in msg || 'photo' in msg || 'video' in msg || 'animation' in msg)) {
        try {
          await ctx.reply('Sorry, I can only process text messages at the moment.');
        } catch {
          // Ignore reply errors
        }
      }
      return;
    }

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

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

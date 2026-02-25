import { Bot, type Context } from 'grammy';
import { BaseChannel, type ChannelConfig } from '../base-channel.ts';
import type { MessageBus } from '../bus.ts';
import type { OutboundMessage } from '../messages.ts';
import type { AdminProvider } from '../admin.ts';
import { markdownToTelegramHtml, splitMessage } from './format.ts';
import { downloadTelegramFile, type MediaType } from './media.ts';
import { createSTTProvider, type STTProvider } from './stt.ts';
import { GroupFilter, type TelegramGroupConfig } from './group.ts';

/** Config for a sub-bot account bound to a specific agent. */
export interface TelegramBotAccount {
  token: string;
  boundAgent: string;
  allowFrom?: string[];
  proxy?: string;
  replyToMessage?: boolean;
  sttProvider?: 'groq' | 'whisper';
  sttApiKey?: string;
  group?: TelegramGroupConfig;
  mediaDir?: string;
}

export interface TelegramChannelConfig extends ChannelConfig {
  token: string;
  proxy?: string;
  replyToMessage?: boolean;
  sttProvider?: 'groq' | 'whisper';
  sttApiKey?: string;
  adminUsers?: string[];
  group?: TelegramGroupConfig;
  mediaDir?: string;
  /** Sub-bot accounts, keyed by bot ID (e.g. "finance", "support"). */
  accounts?: Record<string, TelegramBotAccount>;
  // --- internal fields set by server, not from user config ---
  botId?: string;
  boundAgent?: string;
}

export class TelegramChannel extends BaseChannel {
  readonly name: string;
  private bot: Bot | null = null;
  private typingIntervals = new Map<string, ReturnType<typeof setInterval>>();
  private typingActions = new Map<string, string>();
  private adminProvider: AdminProvider | null = null;
  private sttProvider: STTProvider | null = null;
  private groupFilter: GroupFilter | null = null;

  constructor(
    protected override config: TelegramChannelConfig,
    bus: MessageBus,
  ) {
    super(config, bus);
    // Dynamic name: 'telegram' for primary, 'telegram.{botId}' for sub-bots
    this.name = config.botId ? `telegram.${config.botId}` : 'telegram';
  }

  setAdminProvider(provider: AdminProvider): void {
    this.adminProvider = provider;
  }

  async start(): Promise<void> {
    // Proxy: Bun/Node fetch reads HTTPS_PROXY env var automatically
    if (this.config.proxy && !process.env['HTTPS_PROXY']) {
      process.env['HTTPS_PROXY'] = this.config.proxy;
    }

    this.bot = new Bot(this.config.token);

    // Initialize STT
    this.sttProvider = createSTTProvider(this.config.sttProvider, this.config.sttApiKey);

    // Initialize group filter
    if (this.config.group) {
      this.groupFilter = new GroupFilter(this.config.group);
    }

    // Commands — sub-bots get a smaller set
    this.bot.command('start', (ctx) => this.onStart(ctx));
    this.bot.command('new', (ctx) => this.onNew(ctx));
    this.bot.command('help', (ctx) => this.onHelp(ctx));

    if (!this.config.boundAgent) {
      // Admin commands only on primary bot
      this.bot.command('status', (ctx) => this.onStatus(ctx));
      this.bot.command('cancel', (ctx) => this.onCancel(ctx));
      this.bot.command('logs', (ctx) => this.onLogs(ctx));
      this.bot.command('restart', (ctx) => this.onRestart(ctx));
    }

    this.bot.on('message', (ctx) => this.onMessage(ctx));

    // Get bot identity for group mention detection
    const me = await this.bot.api.getMe();
    if (this.groupFilter) {
      this.groupFilter.init(me.username ?? '', me.id);
    }

    this.bot.start({
      allowed_updates: ['message', 'callback_query'],
    });
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const interval of this.typingIntervals.values()) {
      clearInterval(interval);
    }
    this.typingIntervals.clear();
    this.typingActions.clear();
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
        // Detect media type from extension for appropriate send method
        if (/\.(jpg|jpeg|png|gif|webp)$/i.test(mediaPath)) {
          await this.bot.api.sendPhoto(chatId, mediaPath);
        } else if (/\.(ogg|opus)$/i.test(mediaPath)) {
          await this.bot.api.sendVoice(chatId, mediaPath);
        } else {
          await this.bot.api.sendDocument(chatId, mediaPath);
        }
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
    const lines = [
      'Welcome to NanoSwarm! Send me a message to start chatting.',
      '',
      'Commands:',
      '/new - Start a new conversation',
      '/help - Show this help message',
    ];
    if (!this.config.boundAgent) {
      lines.push(
        '',
        'Admin commands:',
        '/status - System health (admin only)',
        '/cancel [id] - Cancel a running task (admin only)',
        '/logs [N|error] - View recent logs (admin only)',
        '/restart - Restart the service (admin only)',
      );
    }
    await ctx.reply(lines.join('\n'));
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
    const lines = [
      'NanoSwarm Bot',
      '',
      'Send any text message to chat with the agent.',
      'You can also send photos, voice messages, audio files, and documents.',
      '',
      'Commands:',
      '/new - Start a new conversation',
      '/help - Show help',
    ];
    if (!this.config.boundAgent) {
      lines.push(
        '',
        'Admin commands:',
        '/status - System health (admin only)',
        '/cancel [id] - Cancel a running task (admin only)',
        '/logs [N|error] - View recent logs (admin only)',
        '/restart - Restart the service (admin only)',
      );
    }
    await ctx.reply(lines.join('\n'));
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

    // Group filter — check before processing
    if (this.groupFilter && !this.groupFilter.shouldRespond(ctx)) {
      return;
    }

    const msg = ctx.message;
    if (!msg) return;

    const contentParts: string[] = [];
    const mediaPaths: string[] = [];

    // Determine media file and type
    let mediaFileId: string | undefined;
    let mediaType: MediaType | undefined;
    let mimeType: string | undefined;
    let fileName: string | undefined;

    if (msg.photo && msg.photo.length > 0) {
      // Pick the largest resolution (last element)
      const photo = msg.photo[msg.photo.length - 1];
      mediaFileId = photo.file_id;
      mediaType = 'image';
    } else if (msg.sticker) {
      mediaFileId = msg.sticker.file_id;
      mediaType = 'sticker';
    } else if (msg.voice) {
      mediaFileId = msg.voice.file_id;
      mediaType = 'voice';
      mimeType = msg.voice.mime_type;
    } else if (msg.audio) {
      mediaFileId = msg.audio.file_id;
      mediaType = 'audio';
      mimeType = msg.audio.mime_type;
      fileName = msg.audio.file_name;
    } else if (msg.document) {
      mediaFileId = msg.document.file_id;
      mediaType = 'file';
      mimeType = msg.document.mime_type;
      fileName = msg.document.file_name;
    }

    // Download media if present
    if (mediaFileId && mediaType && this.bot) {
      try {
        const downloaded = await downloadTelegramFile(this.bot, mediaFileId, mediaType, {
          mimeType,
          fileName,
          mediaDir: this.config.mediaDir,
        });

        if (mediaType === 'sticker') {
          // Stickers are described as text, not forwarded as media
          contentParts.push('[Sticker]');
        } else if (mediaType === 'voice' || mediaType === 'audio') {
          // Try STT transcription
          let transcription = '';
          if (this.sttProvider) {
            try {
              transcription = await this.sttProvider.transcribe(downloaded.path);
            } catch (err) {
              console.error(`[${this.name}] STT error:`, err);
            }
          }
          if (transcription) {
            contentParts.push(`[transcription: ${transcription}]`);
          } else {
            contentParts.push('[Audio message attached]');
          }
          mediaPaths.push(downloaded.path);
        } else {
          // image, file
          mediaPaths.push(downloaded.path);
        }
      } catch (err) {
        console.error(`[${this.name}] Media download error:`, err);
      }
    }

    // Add text content (or caption for media messages)
    let text = msg.text ?? msg.caption ?? '';

    // Strip @mention from group messages
    if (this.groupFilter && text) {
      text = this.groupFilter.stripMention(text);
    }

    if (text) {
      contentParts.push(text);
    }

    // Skip if no content at all
    const content = contentParts.join('\n');
    if (!content && mediaPaths.length === 0) {
      return;
    }

    // Start typing indicator
    this.startTyping(chatId, mediaPaths.length > 0 ? 'upload_photo' : 'typing');

    await this.handleMessage({
      senderId,
      chatId,
      content: content || '[Media attached]',
      media: mediaPaths,
      metadata: {
        messageId: msg.message_id,
        ...(this.config.boundAgent ? { agentId: this.config.boundAgent } : {}),
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

  private startTyping(chatId: string, action = 'typing'): void {
    this.stopTyping(chatId);
    this.typingActions.set(chatId, action);
    const send = () => {
      const a = this.typingActions.get(chatId) ?? 'typing';
      this.bot?.api.sendChatAction(chatId, a as 'typing').catch(() => {});
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
    this.typingActions.delete(chatId);
  }
}

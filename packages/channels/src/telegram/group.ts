import type { Context } from 'grammy';

export interface TelegramGroupConfig {
  /** Require @mention or reply-to-bot before responding in groups */
  requireMention?: boolean;
  /** Group access policy: 'open' | 'allowlist' | 'disabled' */
  policy?: 'open' | 'allowlist' | 'disabled';
  /** Allowed group chat IDs (when policy is 'allowlist') */
  allowGroups?: string[];
  /** Minimum seconds between responses in the same group (0 = no cooldown) */
  cooldownSeconds?: number;
}

export class GroupFilter {
  private cooldowns = new Map<string, number>();
  private botUsername: string | null = null;
  private botId: number | null = null;

  constructor(private config: TelegramGroupConfig) {}

  /** Initialize bot identity for mention detection. Call after bot.api.getMe(). */
  init(botUsername: string, botId: number): void {
    this.botUsername = botUsername;
    this.botId = botId;
  }

  /** Check whether the bot should respond to this group message. */
  shouldRespond(ctx: Context): boolean {
    const chat = ctx.chat;
    if (!chat) return false;

    // Not a group — always respond
    if (chat.type === 'private') return true;

    const policy = this.config.policy ?? 'open';

    // Gate 1: policy
    if (policy === 'disabled') return false;
    if (policy === 'allowlist') {
      const allowGroups = this.config.allowGroups ?? [];
      if (!allowGroups.includes(String(chat.id))) return false;
    }

    // Gate 2: require @mention or reply-to-bot
    if (this.config.requireMention !== false) {
      const text = ctx.message?.text ?? ctx.message?.caption ?? '';
      const mentioned = this.botUsername
        ? text.includes(`@${this.botUsername}`)
        : false;
      const repliedToBot =
        ctx.message?.reply_to_message?.from?.id === this.botId;
      if (!mentioned && !repliedToBot) return false;
    }

    // Gate 3: cooldown
    const cooldown = this.config.cooldownSeconds ?? 0;
    if (cooldown > 0) {
      const chatId = String(chat.id);
      const now = Date.now() / 1000;
      const last = this.cooldowns.get(chatId) ?? 0;
      if (now - last < cooldown) return false;
      this.cooldowns.set(chatId, now);
    }

    return true;
  }

  /** Strip @botUsername from message text. */
  stripMention(text: string): string {
    if (!this.botUsername) return text;
    return text.replace(new RegExp(`@${this.botUsername}`, 'g'), '').trim();
  }
}

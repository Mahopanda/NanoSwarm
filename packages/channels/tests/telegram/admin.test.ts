import { describe, it, expect } from 'bun:test';
import { TelegramChannel } from '../../src/telegram/channel.ts';
import { MessageBus } from '../../src/bus.ts';
import type { AdminProvider, AgentStatus } from '../../src/admin.ts';

function makeChannel(opts?: {
  adminUsers?: string[];
  allowFrom?: string[];
}): TelegramChannel {
  const bus = new MessageBus();
  return new TelegramChannel(
    { enabled: true, token: 'fake-token', ...opts },
    bus,
  );
}

function makeStatus(overrides?: Partial<AgentStatus>): AgentStatus {
  return {
    running: true,
    idle: true,
    processingSeconds: 0,
    currentSender: null,
    lastActivityAgo: 5,
    messagesProcessed: 42,
    errorsCount: 2,
    uptimeSeconds: 3600,
    runningAgents: [],
    cronJobs: 1,
    ...overrides,
  };
}

function makeProvider(overrides?: Partial<AdminProvider>): AdminProvider {
  return {
    getStatus: () => makeStatus(),
    getRunningTasks: () => [],
    cancelTask: () => false,
    getRecentLogs: () => [],
    ...overrides,
  };
}

// Helper to test the isAdmin logic by accessing it through a command handler
// We simulate the context and capture the reply
function makeCtx(userId: number, username?: string): { ctx: any; replies: string[] } {
  const replies: string[] = [];
  const ctx = {
    from: { id: userId, username },
    chat: { id: 123 },
    message: { text: '' },
    reply: async (text: string, _opts?: any) => {
      replies.push(text);
    },
  };
  return { ctx, replies };
}

describe('TelegramChannel Admin', () => {
  describe('isAdmin', () => {
    it('should identify admin by adminUsers config', async () => {
      const ch = makeChannel({ adminUsers: ['alice'] });
      ch.setAdminProvider(makeProvider());

      // Admin user (matched by username in pipe-separated senderId)
      const { ctx, replies } = makeCtx(111, 'alice');
      ctx.message.text = '/status';
      // Access private method via command handler
      await (ch as any).onStatus(ctx);
      expect(replies[0]).toContain('State:');
    });

    it('should fall back to allowFrom when adminUsers is not set', async () => {
      const ch = makeChannel({ allowFrom: ['bob'] });
      ch.setAdminProvider(makeProvider());

      const { ctx, replies } = makeCtx(222, 'bob');
      ctx.message.text = '/status';
      await (ch as any).onStatus(ctx);
      expect(replies[0]).toContain('State:');
    });

    it('should deny access when neither adminUsers nor allowFrom is set', async () => {
      const ch = makeChannel();
      ch.setAdminProvider(makeProvider());

      const { ctx, replies } = makeCtx(333, 'unknown');
      ctx.message.text = '/status';
      await (ch as any).onStatus(ctx);
      expect(replies[0]).toBe('Permission denied. Admin only.');
    });

    it('should match pipe-separated senderId', async () => {
      const ch = makeChannel({ adminUsers: ['456'] });
      ch.setAdminProvider(makeProvider());

      // extractSenderId returns "456|someuser"
      const { ctx, replies } = makeCtx(456, 'someuser');
      ctx.message.text = '/status';
      await (ch as any).onStatus(ctx);
      expect(replies[0]).toContain('State:');
    });
  });

  describe('/status', () => {
    it('should show provider not configured when no adminProvider', async () => {
      const ch = makeChannel({ adminUsers: ['admin'] });

      const { ctx, replies } = makeCtx(1, 'admin');
      ctx.message.text = '/status';
      await (ch as any).onStatus(ctx);
      expect(replies[0]).toBe('Admin provider not configured.');
    });

    it('should deny non-admin users', async () => {
      const ch = makeChannel({ adminUsers: ['admin'] });
      ch.setAdminProvider(makeProvider());

      const { ctx, replies } = makeCtx(999, 'hacker');
      ctx.message.text = '/status';
      await (ch as any).onStatus(ctx);
      expect(replies[0]).toBe('Permission denied. Admin only.');
    });
  });

  describe('/cancel', () => {
    it('should list running tasks when no ID provided', async () => {
      const ch = makeChannel({ adminUsers: ['admin'] });
      ch.setAdminProvider(makeProvider({
        getRunningTasks: () => [
          { taskId: 'abc123', label: 'search-web' },
        ],
      }));

      const { ctx, replies } = makeCtx(1, 'admin');
      ctx.message.text = '/cancel';
      await (ch as any).onCancel(ctx);
      expect(replies[0]).toContain('Running tasks:');
      expect(replies[0]).toContain('abc123');
    });

    it('should cancel a task when valid ID provided', async () => {
      const ch = makeChannel({ adminUsers: ['admin'] });
      ch.setAdminProvider(makeProvider({
        cancelTask: (id) => id === 'abc123',
      }));

      const { ctx, replies } = makeCtx(1, 'admin');
      ctx.message.text = '/cancel abc123';
      await (ch as any).onCancel(ctx);
      expect(replies[0]).toBe('Task abc123 cancelled.');
    });
  });

  describe('/logs', () => {
    it('should show recent logs with default count', async () => {
      const ch = makeChannel({ adminUsers: ['admin'] });
      ch.setAdminProvider(makeProvider({
        getRecentLogs: (count) => {
          return [`[10:00:00] tool-start: read_file (count=${count})`];
        },
      }));

      const { ctx, replies } = makeCtx(1, 'admin');
      ctx.message.text = '/logs';
      await (ch as any).onLogs(ctx);
      expect(replies[0]).toContain('tool-start');
      expect(replies[0]).toContain('count=50');
    });

    it('should filter errors when "error" argument is given', async () => {
      const ch = makeChannel({ adminUsers: ['admin'] });
      ch.setAdminProvider(makeProvider({
        getRecentLogs: (_count, filter) => {
          return filter === 'error'
            ? ['[10:00:01] error: something failed']
            : ['all logs'];
        },
      }));

      const { ctx, replies } = makeCtx(1, 'admin');
      ctx.message.text = '/logs error';
      await (ch as any).onLogs(ctx);
      expect(replies[0]).toContain('error: something failed');
    });
  });
});

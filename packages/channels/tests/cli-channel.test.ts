import { describe, it, expect } from 'bun:test';
import { CLIChannel } from '../src/cli-channel.ts';
import { MessageBus } from '../src/bus.ts';
import type { OutboundMessage } from '../src/messages.ts';

describe('CLIChannel', () => {
  it('should have name "cli"', () => {
    const bus = new MessageBus();
    const ch = new CLIChannel({ enabled: true }, bus);
    expect(ch.name).toBe('cli');
  });

  it('should format progress output with "> " prefix', async () => {
    const bus = new MessageBus();
    const ch = new CLIChannel({ enabled: true }, bus);

    const logged: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logged.push(String(args[0]));

    const msg: OutboundMessage = {
      channel: 'cli',
      chatId: 'cli',
      content: 'thinking...',
      media: [],
      metadata: { _progress: true },
    };
    await ch.send(msg);

    console.log = originalLog;
    expect(logged).toContain('> thinking...');
  });

  it('should format full reply with "Agent: " prefix', async () => {
    const bus = new MessageBus();
    const ch = new CLIChannel({ enabled: true }, bus);

    const logged: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => logged.push(String(args[0]));

    const msg: OutboundMessage = {
      channel: 'cli',
      chatId: 'cli',
      content: 'Hello!',
      media: [],
      metadata: {},
    };
    await ch.send(msg);

    console.log = originalLog;
    expect(logged).toContain('Agent: Hello!');
  });

  it('should use default prompt when not specified', () => {
    const bus = new MessageBus();
    const ch = new CLIChannel({ enabled: true }, bus);
    // Just verifying construction doesn't throw with defaults
    expect(ch.isRunning).toBe(false);
  });
});

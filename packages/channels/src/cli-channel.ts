import * as readline from 'node:readline';
import { BaseChannel, type ChannelConfig } from './base-channel.ts';
import type { MessageBus } from './bus.ts';
import type { OutboundMessage } from './messages.ts';

export interface CLIChannelConfig extends ChannelConfig {
  prompt?: string;
}

export class CLIChannel extends BaseChannel {
  readonly name = 'cli';
  private rl: readline.Interface | null = null;
  private prompt: string;

  constructor(config: CLIChannelConfig, bus: MessageBus) {
    super(config, bus);
    this.prompt = config.prompt ?? 'You: ';
  }

  async start(): Promise<void> {
    this.running = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.rl.on('close', () => {
      this.running = false;
    });

    this.promptLine();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.rl?.close();
    this.rl = null;
  }

  async send(msg: OutboundMessage): Promise<void> {
    const isProgress = msg.metadata?._progress === true;
    const prefix = isProgress ? '> ' : 'Agent: ';
    const output = msg.content
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    console.log(output);

    if (!isProgress) {
      this.promptLine();
    }
  }

  private promptLine(): void {
    if (!this.rl || !this.running) return;
    this.rl.question(this.prompt, (input) => {
      const trimmed = input.trim();
      if (trimmed === 'exit' || trimmed === '/exit') {
        this.stop();
        return;
      }
      if (trimmed) {
        this.handleMessage({
          senderId: 'cli-user',
          chatId: 'cli',
          content: trimmed,
        });
      }
      this.promptLine();
    });
  }
}

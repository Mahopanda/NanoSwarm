import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

const HEARTBEAT_PROMPT = `Read HEARTBEAT.md in your workspace (if it exists).
Follow any instructions or tasks listed there.
If nothing needs attention, reply with just: HEARTBEAT_OK`;

export class HeartbeatService {
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private workspace: string,
    private onHeartbeat?: (prompt: string) => Promise<string>,
    private intervalMs: number = DEFAULT_INTERVAL_MS,
    private enabled: boolean = true,
  ) {}

  start(): void {
    if (!this.enabled || this.interval !== null) return;
    this.interval = setInterval(() => this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.interval !== null) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  async triggerNow(): Promise<string | null> {
    return this.tick();
  }

  private async tick(): Promise<string | null> {
    const heartbeatPath = join(this.workspace, '.nanoswarm', 'HEARTBEAT.md');
    let content: string | null = null;
    try {
      content = await readFile(heartbeatPath, 'utf-8');
    } catch {
      return null;
    }

    if (this.isHeartbeatEmpty(content)) {
      return null;
    }

    if (!this.onHeartbeat) return null;

    const response = await this.onHeartbeat(HEARTBEAT_PROMPT);
    return response;
  }

  private isHeartbeatEmpty(content: string | null): boolean {
    if (!content) return true;
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      if (trimmed.startsWith('#')) continue;
      if (trimmed.startsWith('<!--') && trimmed.endsWith('-->')) continue;
      // Unchecked checkbox = has actionable content
      if (trimmed.startsWith('- [ ]')) return false;
      // Non-comment, non-header, non-empty line = has content
      if (!trimmed.startsWith('- [x]')) return false;
    }
    return true;
  }
}

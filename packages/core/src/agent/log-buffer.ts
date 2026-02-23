import type { EventBus } from '../events/event-bus.ts';

export class LogBuffer {
  private entries: string[] = [];

  constructor(private maxEntries = 500) {}

  push(entry: string): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  tail(count: number): string[] {
    return this.entries.slice(-count);
  }

  filter(pattern: 'error'): string[] {
    return this.entries.filter((e) => e.toLowerCase().includes(pattern));
  }

  static attach(eventBus: EventBus): LogBuffer {
    const buf = new LogBuffer();
    const ts = () => new Date().toISOString().slice(11, 19);

    eventBus.on('tool-start', (d) => {
      buf.push(`[${ts()}] tool-start: ${d.toolName}`);
    });
    eventBus.on('tool-finish', (d) => {
      const status = d.result === 'error' ? 'error' : 'ok';
      buf.push(`[${ts()}] tool-finish: ${d.toolName} (${status}, ${d.durationMs}ms)`);
    });
    eventBus.on('error', (d) => {
      buf.push(`[${ts()}] error: ${d.message}`);
    });
    eventBus.on('subagent-start', (d) => {
      buf.push(`[${ts()}] subagent-start: [${d.label}] ${d.taskId}`);
    });
    eventBus.on('subagent-finish', (d) => {
      buf.push(`[${ts()}] subagent-finish: [${d.label}] ${d.taskId}`);
    });

    return buf;
  }
}

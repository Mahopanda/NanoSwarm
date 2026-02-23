import { join } from 'node:path';
import { mkdir, readFile, appendFile } from 'node:fs/promises';
import type { HistoryEntry } from './types.ts';

export interface HistoryStore {
  append(contextId: string, userMessage: string, agentResponse: string): Promise<void>;
  getHistory(contextId: string, limit?: number): Promise<HistoryEntry[]>;
  search(contextId: string, query: string): Promise<HistoryEntry[]>;
}

function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}`;
}

function parseTimestamp(ts: string): Date {
  const [datePart, timePart] = ts.split(' ');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

export class FileHistoryStore implements HistoryStore {
  constructor(private workspace: string) {}

  private historyPath(contextId: string): string {
    return join(this.workspace, '.nanoswarm', 'memory', contextId, 'HISTORY.md');
  }

  async append(contextId: string, userMessage: string, agentResponse: string): Promise<void> {
    const filePath = this.historyPath(contextId);
    await mkdir(join(filePath, '..'), { recursive: true });
    const ts = formatTimestamp(new Date());
    const line = `[${ts}] User: ${userMessage} | Agent: ${agentResponse}\n`;
    await appendFile(filePath, line, 'utf-8');
  }

  async getHistory(contextId: string, limit?: number): Promise<HistoryEntry[]> {
    let content: string;
    try {
      content = await readFile(this.historyPath(contextId), 'utf-8');
    } catch {
      return [];
    }

    const lines = content.trim().split('\n').filter(Boolean);
    const entries: HistoryEntry[] = [];

    for (const line of lines) {
      const match = line.match(/^\[(.+?)\] User: (.+?) \| Agent: (.+)$/);
      if (!match) continue;
      entries.push({
        timestamp: parseTimestamp(match[1]),
        userMessage: match[2],
        agentResponse: match[3],
      });
    }

    if (limit !== undefined && limit > 0) {
      return entries.slice(-limit);
    }
    return entries;
  }

  async search(contextId: string, query: string): Promise<HistoryEntry[]> {
    const entries = await this.getHistory(contextId);
    const q = query.toLowerCase();
    return entries.filter(
      (e) =>
        e.userMessage.toLowerCase().includes(q) ||
        e.agentResponse.toLowerCase().includes(q),
    );
  }
}

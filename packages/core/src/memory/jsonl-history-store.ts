import { join } from 'node:path';
import { mkdir, readFile, appendFile, rename, readdir, stat, open } from 'node:fs/promises';
import type { HistoryEntry } from './types.ts';
import type { HistoryStore } from './history-store.ts';

interface JsonlRecord {
  ts: string;
  u: string;
  a: string;
}

function parseJsonlLine(line: string): HistoryEntry | null {
  try {
    const obj = JSON.parse(line) as JsonlRecord;
    return {
      timestamp: new Date(obj.ts),
      userMessage: obj.u,
      agentResponse: obj.a,
    };
  } catch {
    return null;
  }
}

function parseLegacyLine(line: string): HistoryEntry | null {
  const match = line.match(/^\[(.+?)\] User: (.+?) \| Agent: (.+)$/);
  if (!match) return null;
  const [datePart, timePart] = match[1].split(' ');
  const [y, mo, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  return {
    timestamp: new Date(y, mo - 1, d, h, mi),
    userMessage: match[2],
    agentResponse: match[3],
  };
}

export class JsonlHistoryStore implements HistoryStore {
  constructor(private workspace: string) {}

  private dirPath(contextId: string): string {
    return join(this.workspace, '.nanoswarm', 'memory', contextId);
  }

  private filePath(contextId: string): string {
    return join(this.dirPath(contextId), 'history.jsonl');
  }

  private legacyPath(contextId: string): string {
    return join(this.dirPath(contextId), 'HISTORY.md');
  }

  async append(contextId: string, userMessage: string, agentResponse: string): Promise<void> {
    const dir = this.dirPath(contextId);
    await mkdir(dir, { recursive: true });

    const fp = this.filePath(contextId);

    // Lazy migration: if JSONL doesn't exist but legacy does, migrate first
    if (!(await fileExists(fp)) && (await fileExists(this.legacyPath(contextId)))) {
      await this.migrateLegacy(contextId);
    }

    const record: JsonlRecord = {
      ts: new Date().toISOString(),
      u: userMessage,
      a: agentResponse,
    };
    await appendFile(fp, JSON.stringify(record) + '\n', 'utf-8');
  }

  async getHistory(contextId: string, limit?: number): Promise<HistoryEntry[]> {
    const fp = this.filePath(contextId);

    if (await fileExists(fp)) {
      const entries = limit !== undefined && limit > 0
        ? await this.readTail(fp, limit)
        : await this.readAll(fp);
      return entries;
    }

    // Fallback: read legacy HISTORY.md
    return this.readLegacy(contextId, limit);
  }

  async search(contextId: string, query: string): Promise<HistoryEntry[]> {
    const dir = this.dirPath(contextId);
    const q = query.toLowerCase();
    const allEntries: HistoryEntry[] = [];

    let files: string[];
    try {
      files = (await readdir(dir))
        .filter((f) => f.startsWith('history') && f.endsWith('.jsonl'))
        .sort();
    } catch {
      // Directory doesn't exist — try legacy fallback
      return this.searchLegacy(contextId, query);
    }

    for (const file of files) {
      const entries = await this.readAll(join(dir, file));
      allEntries.push(...entries);
    }

    return allEntries.filter(
      (e) =>
        e.userMessage.toLowerCase().includes(q) ||
        e.agentResponse.toLowerCase().includes(q),
    );
  }

  async archive(contextId: string): Promise<void> {
    const src = this.filePath(contextId);
    try {
      await stat(src);
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = join(this.dirPath(contextId), `history.${ts}.jsonl`);
      await rename(src, dest);
    } catch {
      // Active file doesn't exist, skip
    }
  }

  // --- Internal helpers ---

  private async readTail(path: string, limit: number): Promise<HistoryEntry[]> {
    const fh = await open(path, 'r');
    try {
      const { size } = await fh.stat();
      if (size === 0) return [];
      const chunkSize = Math.min(size, limit * 1024);
      const startPos = Math.max(0, size - chunkSize);
      const buf = Buffer.alloc(chunkSize);
      await fh.read(buf, 0, chunkSize, startPos);
      const lines = buf.toString('utf-8').split('\n').filter(Boolean);
      const startIdx = startPos > 0 ? 1 : 0; // skip partial first line
      return lines
        .slice(startIdx)
        .slice(-limit)
        .map(parseJsonlLine)
        .filter((e): e is HistoryEntry => e !== null);
    } finally {
      await fh.close();
    }
  }

  private async readAll(path: string): Promise<HistoryEntry[]> {
    let content: string;
    try {
      content = await readFile(path, 'utf-8');
    } catch {
      return [];
    }
    return content
      .split('\n')
      .filter(Boolean)
      .map(parseJsonlLine)
      .filter((e): e is HistoryEntry => e !== null);
  }

  private async readLegacy(contextId: string, limit?: number): Promise<HistoryEntry[]> {
    let content: string;
    try {
      content = await readFile(this.legacyPath(contextId), 'utf-8');
    } catch {
      return [];
    }
    const entries = content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(parseLegacyLine)
      .filter((e): e is HistoryEntry => e !== null);

    if (limit !== undefined && limit > 0) {
      return entries.slice(-limit);
    }
    return entries;
  }

  private async searchLegacy(contextId: string, query: string): Promise<HistoryEntry[]> {
    const entries = await this.readLegacy(contextId);
    const q = query.toLowerCase();
    return entries.filter(
      (e) =>
        e.userMessage.toLowerCase().includes(q) ||
        e.agentResponse.toLowerCase().includes(q),
    );
  }

  private async migrateLegacy(contextId: string): Promise<void> {
    const entries = await this.readLegacy(contextId);
    if (entries.length === 0) return;

    const fp = this.filePath(contextId);
    const lines = entries.map((e) =>
      JSON.stringify({
        ts: e.timestamp.toISOString(),
        u: e.userMessage,
        a: e.agentResponse,
      } satisfies JsonlRecord),
    );
    await appendFile(fp, lines.join('\n') + '\n', 'utf-8');
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

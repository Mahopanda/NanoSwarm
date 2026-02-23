import type { Database } from 'bun:sqlite';
import type { MemoryStore } from '../memory/memory-store.ts';

export class SQLiteMemoryStore implements MemoryStore {
  private stmtGet;
  private stmtUpsert;

  constructor(private db: Database) {
    this.stmtGet = db.prepare('SELECT content FROM memory WHERE context_id = ?');
    this.stmtUpsert = db.prepare(`
      INSERT INTO memory (context_id, content, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(context_id) DO UPDATE SET
        content = excluded.content,
        updated_at = excluded.updated_at
    `);
  }

  async getMemory(contextId: string): Promise<string | null> {
    const row = this.stmtGet.get(contextId) as { content: string } | null;
    return row?.content ?? null;
  }

  async saveMemory(contextId: string, content: string): Promise<void> {
    this.stmtUpsert.run(contextId, content);
  }
}

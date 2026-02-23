import type { Database } from 'bun:sqlite';
import type { HistoryStore } from '../memory/history-store.ts';
import type { HistoryEntry } from '../memory/types.ts';

export class SQLiteHistoryStore implements HistoryStore {
  private stmtInsert;
  private stmtSelectAll;
  private stmtSelectLimit;
  private stmtSearch;

  constructor(private db: Database) {
    this.stmtInsert = db.prepare(`
      INSERT INTO history (context_id, user_message, agent_response, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    this.stmtSelectAll = db.prepare(
      'SELECT user_message, agent_response, created_at FROM history WHERE context_id = ? ORDER BY id ASC',
    );
    this.stmtSelectLimit = db.prepare(
      'SELECT user_message, agent_response, created_at FROM history WHERE context_id = ? ORDER BY id DESC LIMIT ?',
    );
    this.stmtSearch = db.prepare(`
      SELECT h.user_message, h.agent_response, h.created_at
      FROM history_fts f
      JOIN history h ON h.id = f.rowid
      WHERE h.context_id = ? AND history_fts MATCH ?
      ORDER BY h.id ASC
    `);
  }

  async append(contextId: string, userMessage: string, agentResponse: string): Promise<void> {
    this.stmtInsert.run(contextId, userMessage, agentResponse);
  }

  async getHistory(contextId: string, limit?: number): Promise<HistoryEntry[]> {
    if (limit !== undefined && limit > 0) {
      const rows = this.stmtSelectLimit.all(contextId, limit) as Array<{
        user_message: string;
        agent_response: string;
        created_at: string;
      }>;
      // DESC + LIMIT → reverse to get chronological order
      return rows.reverse().map(toEntry);
    }
    const rows = this.stmtSelectAll.all(contextId) as Array<{
      user_message: string;
      agent_response: string;
      created_at: string;
    }>;
    return rows.map(toEntry);
  }

  async search(contextId: string, query: string): Promise<HistoryEntry[]> {
    const rows = this.stmtSearch.all(contextId, query) as Array<{
      user_message: string;
      agent_response: string;
      created_at: string;
    }>;
    return rows.map(toEntry);
  }
}

function toEntry(row: {
  user_message: string;
  agent_response: string;
  created_at: string;
}): HistoryEntry {
  return {
    userMessage: row.user_message,
    agentResponse: row.agent_response,
    timestamp: new Date(row.created_at + 'Z'),
  };
}

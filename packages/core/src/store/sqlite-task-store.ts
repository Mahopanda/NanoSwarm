import type { Database } from 'bun:sqlite';

export class SQLiteTaskStore {
  private stmtLoad;
  private stmtUpsert;

  constructor(private db: Database) {
    this.stmtLoad = db.prepare('SELECT data FROM tasks WHERE id = ?');
    this.stmtUpsert = db.prepare(`
      INSERT INTO tasks (id, context_id, data, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        context_id = excluded.context_id,
        data = excluded.data,
        updated_at = excluded.updated_at
    `);
  }

  async save(task: any): Promise<void> {
    const id = task.id ?? task.taskId;
    const contextId = task.contextId ?? '';
    this.stmtUpsert.run(id, contextId, JSON.stringify(task));
  }

  async load(taskId: string): Promise<any | undefined> {
    const row = this.stmtLoad.get(taskId) as { data: string } | null;
    if (!row) return undefined;
    return JSON.parse(row.data);
  }
}

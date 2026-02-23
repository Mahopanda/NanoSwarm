import type { Database } from 'bun:sqlite';

export function initSchema(db: Database): void {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  // 1. memory
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory (
      context_id TEXT PRIMARY KEY,
      content    TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // 2. history + FTS5
  db.exec(`
    CREATE TABLE IF NOT EXISTS history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      context_id     TEXT NOT NULL,
      user_message   TEXT NOT NULL,
      agent_response TEXT NOT NULL,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_history_context ON history(context_id)`);

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS history_fts USING fts5(
      user_message, agent_response,
      content='history', content_rowid='id'
    )
  `);

  // FTS5 content-sync triggers
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS history_ai AFTER INSERT ON history BEGIN
      INSERT INTO history_fts(rowid, user_message, agent_response)
      VALUES (new.id, new.user_message, new.agent_response);
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS history_ad AFTER DELETE ON history BEGIN
      INSERT INTO history_fts(history_fts, rowid, user_message, agent_response)
      VALUES ('delete', old.id, old.user_message, old.agent_response);
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS history_au AFTER UPDATE ON history BEGIN
      INSERT INTO history_fts(history_fts, rowid, user_message, agent_response)
      VALUES ('delete', old.id, old.user_message, old.agent_response);
      INSERT INTO history_fts(rowid, user_message, agent_response)
      VALUES (new.id, new.user_message, new.agent_response);
    END
  `);

  // 3. tasks (JSON blob for full A2A Task)
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT PRIMARY KEY,
      context_id TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_context ON tasks(context_id)`);

  // 4. registry
  db.exec(`
    CREATE TABLE IF NOT EXISTS registry (
      id                TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      url               TEXT NOT NULL,
      agent_card        TEXT NOT NULL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      created_by        TEXT NOT NULL DEFAULT 'system',
      status            TEXT NOT NULL DEFAULT 'active',
      last_health_check TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_registry_status ON registry(status)`);
}

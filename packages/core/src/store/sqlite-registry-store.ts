import type { Database } from 'bun:sqlite';
import type { RegisteredAgent, RegistryStore } from './types.ts';

export class SQLiteRegistryStore implements RegistryStore {
  private stmtGet;
  private stmtUpsert;
  private stmtListActive;
  private stmtDelete;

  constructor(private db: Database) {
    this.stmtGet = db.prepare(
      'SELECT id, name, url, agent_card, created_at, created_by, status, last_health_check FROM registry WHERE id = ?',
    );
    this.stmtUpsert = db.prepare(`
      INSERT INTO registry (id, name, url, agent_card, created_at, created_by, status, last_health_check)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        url = excluded.url,
        agent_card = excluded.agent_card,
        created_by = excluded.created_by,
        status = excluded.status,
        last_health_check = excluded.last_health_check
    `);
    this.stmtListActive = db.prepare(
      'SELECT id, name, url, agent_card, created_at, created_by, status, last_health_check FROM registry WHERE status = ?',
    );
    this.stmtDelete = db.prepare('DELETE FROM registry WHERE id = ?');
  }

  async register(agent: RegisteredAgent): Promise<void> {
    this.stmtUpsert.run(
      agent.id,
      agent.name,
      agent.url,
      JSON.stringify(agent.agentCard),
      agent.createdAt.toISOString(),
      agent.createdBy,
      agent.status,
      agent.lastHealthCheck?.toISOString() ?? null,
    );
  }

  async get(id: string): Promise<RegisteredAgent | undefined> {
    const row = this.stmtGet.get(id) as RegistryRow | null;
    if (!row) return undefined;
    return toAgent(row);
  }

  async findBySkill(query: string): Promise<RegisteredAgent[]> {
    const stmt = this.db.prepare(`
      SELECT DISTINCT r.id, r.name, r.url, r.agent_card, r.created_at,
             r.created_by, r.status, r.last_health_check
      FROM registry r, json_each(json_extract(r.agent_card, '$.capabilities.skills')) AS skill
      WHERE r.status = 'active'
        AND json_extract(skill.value, '$.name') LIKE ?
    `);
    const rows = stmt.all(`%${query}%`) as RegistryRow[];
    return rows.map(toAgent);
  }

  async listActive(): Promise<RegisteredAgent[]> {
    const rows = this.stmtListActive.all('active') as RegistryRow[];
    return rows.map(toAgent);
  }

  async unregister(id: string): Promise<boolean> {
    const result = this.stmtDelete.run(id);
    return result.changes > 0;
  }
}

interface RegistryRow {
  id: string;
  name: string;
  url: string;
  agent_card: string;
  created_at: string;
  created_by: string;
  status: string;
  last_health_check: string | null;
}

function toAgent(row: RegistryRow): RegisteredAgent {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    agentCard: JSON.parse(row.agent_card),
    createdAt: new Date(row.created_at),
    createdBy: row.created_by as RegisteredAgent['createdBy'],
    status: row.status as RegisteredAgent['status'],
    lastHealthCheck: row.last_health_check ? new Date(row.last_health_check) : undefined,
  };
}

import Database, { Database as SQLiteDatabase } from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../logging/Logger';

export class CheckpointStore {
  private db: SQLiteDatabase;
  private logger = new Logger('CheckpointStore');

  constructor(dbPath?: string) {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const targetDbPath = dbPath || path.join(dataDir, 'execution_checkpoints.db');
    
    this.db = new Database(targetDbPath);
    this.initializeSchema();
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    this.logger.debug('CheckpointStore schema initialized.');
  }

  public async save(checkpointId: string, data: any): Promise<void> {
    const payload = JSON.stringify(data);
    const now = Date.now();
    
    const stmt = this.db.prepare(`
      INSERT INTO checkpoints (id, payload, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `);
    
    stmt.run(checkpointId, payload, now, now);
    this.logger.debug(`Checkpoint ${checkpointId} saved. Size: ${payload.length} bytes.`);
  }

  public async load(checkpointId: string): Promise<any | null> {
    const stmt = this.db.prepare('SELECT payload FROM checkpoints WHERE id = ?');
    const row = stmt.get(checkpointId) as { payload: string } | undefined;
    
    if (!row) {
      return null;
    }
    
    try {
      return JSON.parse(row.payload);
    } catch (e) {
      this.logger.error(`Failed to parse checkpoint ${checkpointId}`, e);
      return null;
    }
  }

  public async exists(checkpointId: string): Promise<boolean> {
    const stmt = this.db.prepare('SELECT 1 FROM checkpoints WHERE id = ?');
    const row = stmt.get(checkpointId);
    return !!row;
  }

  public async delete(checkpointId: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM checkpoints WHERE id = ?');
    const info = stmt.run(checkpointId);
    return info.changes > 0;
  }

  public async listWaiting(): Promise<string[]> {
    const stmt = this.db.prepare('SELECT id FROM checkpoints ORDER BY updated_at DESC');
    const rows = stmt.all() as { id: string }[];
    return rows.map(r => r.id);
  }

  public async cleanup(olderThanMs: number): Promise<number> {
    const cutoff = Date.now() - olderThanMs;
    const stmt = this.db.prepare('DELETE FROM checkpoints WHERE updated_at < ?');
    const info = stmt.run(cutoff);
    this.logger.info(`Cleaned up ${info.changes} stale checkpoints.`);
    return info.changes;
  }
}

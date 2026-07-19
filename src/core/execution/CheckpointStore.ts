import Database, { Database as SQLiteDatabase } from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../logging/Logger';

export class CheckpointStore {
  private db?: SQLiteDatabase;
  private readonly inMemoryCheckpoints = new Map<string, { payload: unknown; createdAt: number; updatedAt: number }>();
  private readonly persistLocally: boolean;
  private logger = new Logger('CheckpointStore');

  constructor(options: { dbPath?: string; persistLocally?: boolean } = {}) {
    this.persistLocally = options.persistLocally ?? true;
    if (!this.persistLocally) {
      this.logger.debug('CheckpointStore initialized with runtime-only retention.');
      return;
    }
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const targetDbPath = options.dbPath || path.join(dataDir, 'execution_checkpoints.db');
    
    this.db = new Database(targetDbPath);
    this.initializeSchema();
  }

  private initializeSchema() {
    if (!this.db) return;
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
    if (!this.db) {
      const existing = this.inMemoryCheckpoints.get(checkpointId);
      this.inMemoryCheckpoints.set(checkpointId, { payload: data, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now() });
      return;
    }
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
    if (!this.db) return this.inMemoryCheckpoints.get(checkpointId)?.payload ?? null;
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
    if (!this.db) return this.inMemoryCheckpoints.has(checkpointId);
    const stmt = this.db.prepare('SELECT 1 FROM checkpoints WHERE id = ?');
    const row = stmt.get(checkpointId);
    return !!row;
  }

  public async delete(checkpointId: string): Promise<boolean> {
    if (!this.db) return this.inMemoryCheckpoints.delete(checkpointId);
    const stmt = this.db.prepare('DELETE FROM checkpoints WHERE id = ?');
    const info = stmt.run(checkpointId);
    return info.changes > 0;
  }

  public async listWaiting(): Promise<string[]> {
    if (!this.db) {
      return [...this.inMemoryCheckpoints.entries()]
        .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
        .map(([id]) => id);
    }
    const stmt = this.db.prepare('SELECT id FROM checkpoints ORDER BY updated_at DESC');
    const rows = stmt.all() as { id: string }[];
    return rows.map(r => r.id);
  }

  public async cleanup(olderThanMs: number): Promise<number> {
    if (!this.db) {
      const cutoff = Date.now() - olderThanMs;
      let removed = 0;
      for (const [id, checkpoint] of this.inMemoryCheckpoints) {
        if (checkpoint.updatedAt < cutoff) {
          this.inMemoryCheckpoints.delete(id);
          removed += 1;
        }
      }
      return removed;
    }
    const cutoff = Date.now() - olderThanMs;
    const stmt = this.db.prepare('DELETE FROM checkpoints WHERE updated_at < ?');
    const info = stmt.run(cutoff);
    this.logger.info(`Cleaned up ${info.changes} stale checkpoints.`);
    return info.changes;
  }
}

import * as fs from 'fs';
import * as path from 'path';

export interface RecordedPost {
  text: string;
  timestamp: number;
  postId?: string;
}

/**
 * ThreadsPostHistoryStore — Records and retrieves recently published posts per session.
 * 
 * Architecture Role: Capability Memory / Persistence
 * Ensures the agent has an anti-repetition memory buffer to avoid publishing duplicate or similar content.
 * Enforces Rule 7 (Universal Codebase Language: English Standard).
 */
export class ThreadsPostHistoryStore {
  private inMemoryCache: Map<string, RecordedPost[]> = new Map();
  private readonly dataDir: string;
  private readonly persistLocally: boolean;

  constructor(options: { dataDir?: string; persistLocally?: boolean } = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), '.data', 'threads_history');
    this.persistLocally = options.persistLocally ?? true;
    this.ensureDirectory();
  }

  private ensureDirectory(): void {
    if (!this.persistLocally) return;
    try {
      if (!fs.existsSync(this.dataDir)) {
        fs.mkdirSync(this.dataDir, { recursive: true });
      }
    } catch (e: any) {
      console.warn(`[ThreadsPostHistoryStore] Could not create directory ${this.dataDir}:`, e.message);
    }
  }

  private getFilePath(sessionId: string): string {
    const safeSessionId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(this.dataDir, `history_${safeSessionId}.json`);
  }

  /**
   * Retrieves the most recent published posts for the given session.
   */
  public getRecentPosts(sessionId: string, limit: number = 8): RecordedPost[] {
    let posts = this.inMemoryCache.get(sessionId);

    if (!posts && this.persistLocally) {
      const filePath = this.getFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            posts = parsed;
            this.inMemoryCache.set(sessionId, posts);
          }
        } catch (e: any) {
          console.warn(`[ThreadsPostHistoryStore] Error reading ${filePath}:`, e.message);
        }
      }
    }

    const list = posts || [];
    return list.slice(0, limit);
  }

  /**
   * Records a newly published post for the given session.
   */
  public recordPost(sessionId: string, text: string, postId?: string): void {
    if (!text || !text.trim()) return;

    const trimmedText = text.trim();
    const entry: RecordedPost = {
      text: trimmedText,
      timestamp: Date.now(),
      postId
    };

    const current = this.getRecentPosts(sessionId, 50);
    // Prepend newest post first and keep up to 20 items
    const updated = [entry, ...current.filter(p => p.text !== trimmedText)].slice(0, 20);
    this.inMemoryCache.set(sessionId, updated);

    if (this.persistLocally) {
      try {
        this.ensureDirectory();
        fs.writeFileSync(this.getFilePath(sessionId), JSON.stringify(updated, null, 2), 'utf-8');
        console.log(`[ThreadsPostHistoryStore] Recorded post for session ${sessionId} (total: ${updated.length})`);
      } catch (e: any) {
        console.warn(`[ThreadsPostHistoryStore] Failed to persist post history:`, e.message);
      }
    }
  }

  /**
   * Clears the recorded post history for a session.
   */
  public clear(sessionId: string): void {
    this.inMemoryCache.delete(sessionId);
    if (this.persistLocally) {
      try {
        const filePath = this.getFilePath(sessionId);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e: any) {
        console.warn(`[ThreadsPostHistoryStore] Failed to delete history file:`, e.message);
      }
    }
  }
}

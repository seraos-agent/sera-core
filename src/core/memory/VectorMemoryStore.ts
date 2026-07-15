import * as fs from 'node:fs';
import * as path from 'node:path';

export interface VectorRecord {
  id: string;
  vector: number[];
  metadata: Record<string, any>;
  timestamp: number;
}

export interface SearchResult {
  record: VectorRecord;
  score: number;
}

export class VectorMemoryStore {
  private filePath: string;
  private records: VectorRecord[] = [];

  constructor() {
    this.filePath = path.join(process.cwd(), '.data', 'vector_memory.json');
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) {
      this.records = [];
      return;
    }
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      this.records = JSON.parse(data);
    } catch (e) {
      console.error('[VectorMemoryStore] Failed to load vector memory:', e);
      this.records = [];
    }
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.records, null, 2));
    } catch (e) {
      console.error('[VectorMemoryStore] Failed to save vector memory:', e);
    }
  }

  public insert(id: string, vector: number[], metadata: Record<string, any>): void {
    // Overwrite if exists
    this.records = this.records.filter(r => r.id !== id);
    this.records.push({
      id,
      vector,
      metadata,
      timestamp: Date.now()
    });
    this.save();
  }

  public search(queryVector: number[], topK: number = 3, threshold: number = 0.5): SearchResult[] {
    if (this.records.length === 0) return [];

    const results: SearchResult[] = [];

    for (const record of this.records) {
      if (record.vector.length !== queryVector.length) continue;
      const score = this.cosineSimilarity(queryVector, record.vector);
      if (score >= threshold) {
        results.push({ record, score });
      }
    }

    // Sort descending by score
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

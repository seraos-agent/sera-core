import * as fs from 'node:fs';
import * as path from 'node:path';

export class EpisodicMemoryReader {
  private filePath: string;

  constructor() {
    this.filePath = path.join(process.cwd(), '.data', 'episodic_memory.jsonl');
  }

  /**
   * Safely reads the last N episodes from the JSONL file.
   * If the file doesn't exist or is empty, returns an empty array.
   */
  public readLastEpisodes(count: number): any[] {
    if (!fs.existsSync(this.filePath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      // Split by newline and remove empty lines
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      // Get the last N lines
      const tailLines = lines.slice(-count);
      
      return tailLines.map(line => {
        try {
          return JSON.parse(line);
        } catch (e) {
          return null;
        }
      }).filter(item => item !== null);
    } catch (error) {
      console.error('[EpisodicMemoryReader] Error reading episodic memory:', error);
      return [];
    }
  }
}

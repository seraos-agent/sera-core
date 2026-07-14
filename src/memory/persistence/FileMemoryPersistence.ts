import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { IMemoryPersistence, MemorySnapshot } from '../../core/memory/IMemoryPersistence';
import { CompressionService } from './CompressionService';
import { EncryptionService } from './EncryptionService';

export class FileMemoryPersistence implements IMemoryPersistence {
  private filePath: string;
  private compression: CompressionService;
  private encryption: EncryptionService;

  constructor(sessionId: string, encryptionKeyHex: string) {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fsSync.existsSync(dataDir)) {
      fsSync.mkdirSync(dataDir, { recursive: true });
    }
    const safeId = sessionId.toLowerCase().replace(/[^a-z0-9]/g, '');
    this.filePath = path.join(dataDir, `memory_store_${safeId}.enc`);

    this.compression = new CompressionService();
    this.encryption = new EncryptionService(encryptionKeyHex);
  }

  public async save(snapshot: MemorySnapshot): Promise<void> {
    try {
      const json = JSON.stringify(snapshot);
      const compressed = await this.compression.compress(json);
      const encrypted = this.encryption.encrypt(compressed);
      
      // Write to temp file then rename for atomic write
      const tempPath = `${this.filePath}.tmp`;
      await fs.writeFile(tempPath, encrypted);
      await fs.rename(tempPath, this.filePath);
      console.log(`[FileMemoryPersistence] Checkpoint saved successfully.`);
    } catch (e) {
      console.error(`[FileMemoryPersistence] Failed to save memory snapshot:`, e);
      throw e;
    }
  }

  public async load(): Promise<MemorySnapshot | null> {
    try {
      if (!fsSync.existsSync(this.filePath)) {
        return null;
      }
      const encrypted = await fs.readFile(this.filePath);
      const compressed = this.encryption.decrypt(encrypted);
      const json = await this.compression.decompress(compressed);
      
      console.log(`[FileMemoryPersistence] Snapshot loaded and decrypted successfully.`);
      return JSON.parse(json) as MemorySnapshot;
    } catch (e) {
      console.error(`[FileMemoryPersistence] Failed to load memory snapshot:`, e);
      return null;
    }
  }
}

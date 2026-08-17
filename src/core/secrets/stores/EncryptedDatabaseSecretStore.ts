import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ISecretStore } from '../types';
import { SupabaseRestClient } from '../../persistence/SupabaseRestClient';

/**
 * EncryptedDatabaseSecretStore — Phase 1 ISecretStore implementation.
 *
 * Stores secrets as AES-256-GCM encrypted values in a local JSON file
 * and mirrors them to persistent Supabase storage when available.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;  // 96-bit IV recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

interface EncryptedEntry {
  iv: string;
  tag: string;
  ciphertext: string;
}

export class EncryptedDatabaseSecretStore implements ISecretStore {
  private readonly keyBuffer: Buffer;
  private readonly dbPath: string;
  private readonly supabaseClient: SupabaseRestClient | null;

  constructor() {
    const hexKey = process.env.MASTER_ENCRYPTION_KEY;
    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        '[EncryptedDatabaseSecretStore] MASTER_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
      );
    }
    this.keyBuffer = Buffer.from(hexKey, 'hex');
    this.dbPath = path.join(process.cwd(), '.data', 'secrets.json');
    this.supabaseClient = SupabaseRestClient.fromEnvironment();
  }

  // ── Crypto Helpers ──────────────────────────────────────────────────────

  private encrypt(plaintext: string): EncryptedEntry {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.keyBuffer, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      ciphertext: encrypted.toString('hex'),
    };
  }

  private decrypt(entry: EncryptedEntry): string {
    const iv = Buffer.from(entry.iv, 'hex');
    const tag = Buffer.from(entry.tag, 'hex');
    const ciphertext = Buffer.from(entry.ciphertext, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, this.keyBuffer, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const result = decrypted.toString('utf8');
    // Zero out the decrypted buffer immediately after use
    decrypted.fill(0);
    return result;
  }

  // ── Persistence Helpers ────────────────────────────────────────────────

  private loadDb(): Record<string, EncryptedEntry> {
    try {
      if (fs.existsSync(this.dbPath)) {
        return JSON.parse(fs.readFileSync(this.dbPath, 'utf8'));
      }
    } catch (e) {
      console.error('[EncryptedDatabaseSecretStore] Failed to load secret store:', e);
    }
    return {};
  }

  private saveDb(db: Record<string, EncryptedEntry>): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Atomic write via temp file + rename to prevent corrupt state on crash
    const tmp = this.dbPath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, this.dbPath);
  }

  // ── ISecretStore ───────────────────────────────────────────────────────

  async getSecret(key: string): Promise<string | null> {
    const db = this.loadDb();
    let entry = db[key];
    if (!entry && this.supabaseClient) {
      try {
        const rows = await this.supabaseClient.select<{ id: string; iv: string; tag: string; ciphertext: string }>('sera_secrets', `id=eq.${encodeURIComponent(key)}`);
        if (rows && rows.length > 0) {
          entry = { iv: rows[0].iv, tag: rows[0].tag, ciphertext: rows[0].ciphertext };
          db[key] = entry;
          this.saveDb(db);
        }
      } catch {
        // Fall back to local file entry if table is not configured
      }
    }
    if (!entry) return null;
    return this.decrypt(entry);
  }

  async setSecret(key: string, value: string): Promise<void> {
    const db = this.loadDb();
    const entry = this.encrypt(value);
    db[key] = entry;
    this.saveDb(db);
    console.log(`[SecretStore] Secret stored: ${key}`);

    if (this.supabaseClient) {
      try {
        await this.supabaseClient.upsert('sera_secrets', {
          id: key,
          iv: entry.iv,
          tag: entry.tag,
          ciphertext: entry.ciphertext,
          updated_at: new Date().toISOString()
        }, 'id');
      } catch {
        // Local encryption is already safely committed
      }
    }
  }

  async deleteSecret(key: string): Promise<void> {
    const db = this.loadDb();
    if (key in db) {
      delete db[key];
      this.saveDb(db);
      console.log(`[SecretStore] Secret deleted: ${key}`);
    }
    if (this.supabaseClient) {
      try {
        await this.supabaseClient.upsert('sera_secrets', {
          id: key,
          iv: '',
          tag: '',
          ciphertext: '',
          updated_at: new Date().toISOString()
        }, 'id');
      } catch {}
    }
  }
}

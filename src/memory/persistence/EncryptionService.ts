import * as crypto from 'node:crypto';

export class EncryptionService {
  private key: Buffer;

  /**
   * Initializes the encryption service.
   * @param hexKey A 64-character hex string representing the 32-byte key derived from the user's wallet signature.
   */
  constructor(hexKey: string) {
    this.key = Buffer.from(hexKey, 'hex');
    if (this.key.length !== 32) {
      throw new Error("Encryption key must be exactly 32 bytes (64 hex characters) for AES-256-GCM.");
    }
  }

  /**
   * Encrypts data using AES-256-GCM. 
   * A unique 12-byte IV is generated per operation and prepended to the ciphertext along with the auth tag.
   */
  public encrypt(data: Buffer): Buffer {
    const iv = crypto.randomBytes(12); // 96-bit nonce is standard and recommended for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const authTag = cipher.getAuthTag(); // 16 bytes
    
    // Storage format: [IV (12 bytes)] + [AuthTag (16 bytes)] + [Ciphertext]
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  /**
   * Decrypts AES-256-GCM encrypted data.
   */
  public decrypt(data: Buffer): Buffer {
    if (data.length < 28) { // 12 bytes IV + 16 bytes AuthTag
      throw new Error("Invalid encrypted data format: too short.");
    }

    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const ciphertext = data.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (e) {
      throw new Error("Failed to decrypt data. Invalid key, corrupted data, or authentication tag mismatch.");
    }
  }
}

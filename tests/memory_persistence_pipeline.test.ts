import { describe, it, expect, beforeAll } from 'vitest';
import { CompressionService } from '../src/memory/persistence/CompressionService';
import { EncryptionService } from '../src/memory/persistence/EncryptionService';
import { MemorySnapshot } from '../src/core/memory/IMemoryPersistence';

describe('Memory Persistence Pipeline E2E', () => {
  let compressionService: CompressionService;
  let encryptionService: EncryptionService;
  
  // Use a deterministic 32-byte hex key for testing
  const MOCK_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

  beforeAll(() => {
    compressionService = new CompressionService();
    encryptionService = new EncryptionService(MOCK_KEY);
  });

  it('compresses, encrypts, decrypts, and decompresses successfully', async () => {
    // 1. Create a mock snapshot
    const originalSnapshot: MemorySnapshot = {
      events: [
        { id: 'ev1', source: 'TEST', type: 'TEST_EVENT', timestamp: 123, payload: { info: 'test' } }
      ],
      beliefs: [
        {
          id: 'test-id',
          category: 'SEMANTIC',
          content: 'I am a test belief',
          epistemicStatus: 'CONFIRMED',
          confidence: 1.0,
          evidenceIds: [],
          contradictionIds: [],
          createdAt: 123,
          updatedAt: 123
        }
      ]
    };

    const originalJson = JSON.stringify(originalSnapshot);

    // 2. Compress
    const compressed = await compressionService.compress(originalJson);
    expect(compressed).toBeInstanceOf(Buffer);

    // 3. Encrypt
    const encrypted = encryptionService.encrypt(compressed);
    expect(encrypted).toBeInstanceOf(Buffer);
    
    // GCM IV is 12 bytes, Auth Tag is 16 bytes.
    // Length should be greater than original payload
    expect(encrypted.length).toBeGreaterThan(28); 
    
    // The IV should be unique for each encryption
    const encrypted2 = encryptionService.encrypt(compressed);
    const iv1 = encrypted.subarray(0, 12);
    const iv2 = encrypted2.subarray(0, 12);
    expect(iv1.equals(iv2)).toBe(false);

    // 4. Decrypt
    const decrypted = encryptionService.decrypt(encrypted);
    expect(decrypted.equals(compressed)).toBe(true);

    // 5. Decompress
    const decompressedJson = await compressionService.decompress(decrypted);
    
    // 6. Verify identical output
    const hydratedSnapshot = JSON.parse(decompressedJson);
    expect(hydratedSnapshot).toEqual(originalSnapshot);
  });
});

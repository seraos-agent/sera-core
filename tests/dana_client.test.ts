import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { DanaClient } from '../src/capabilities/fintech/dana/DanaClient';

describe('DanaClient & Cryptographic Security', () => {
  it('formats raw base64 key into valid PEM block', () => {
    const rawKey = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3zc8H1rgl9yZJhebBUtjDKub';
    const pem = DanaClient.formatKeyToPem(rawKey, 'PUBLIC');
    expect(pem).toContain('-----BEGIN PUBLIC KEY-----');
    expect(pem).toContain('-----END PUBLIC KEY-----');
    expect(pem).toContain('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3zc8H1rgl9yZJhebBUtj');
  });

  it('generates and verifies RSA-SHA256 signature using generated keypair', () => {
    // Generate a test keypair
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const client = new DanaClient({
      clientId: 'TEST_CLIENT_123',
      publicKey,
      privateKey
    });

    const timestamp = client.getTimestamp();
    const signature = client.generateAsymmetricSignature(timestamp);
    expect(signature).toBeTruthy();

    const stringToSign = `TEST_CLIENT_123|${timestamp}`;
    const isValid = client.verifySignature(stringToSign, signature);
    expect(isValid).toBe(true);
  });

  it('detects unconfigured placeholder keys in isReady()', () => {
    const client = new DanaClient({
      clientId: '2026092122251807112556',
      clientSecret: 'PASTE_YOUR_CLIENT_SECRET_HERE',
      privateKey: 'PASTE_YOUR_PRIVATE_KEY_HERE'
    });

    expect(client.isReady()).toBe(false);
  });
});

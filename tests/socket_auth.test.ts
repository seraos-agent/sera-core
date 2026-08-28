import { describe, it, expect } from 'vitest';
import { createHmac } from 'crypto';
import { generateSessionToken, verifySessionToken, SESSION_SECRET } from '../src/server/socket/socketAuth';

describe('Socket Authentication Token Security', () => {
  it('generates a valid signed session token and recovers the principal', () => {
    const principal = {
      userId: 'user-alice',
      personalWalletAddress: '0x1111111111111111111111111111111111111111'
    };

    const token = generateSessionToken(principal);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(2);

    const recovered = verifySessionToken(token);
    expect(recovered).not.toBeNull();
    expect(recovered?.userId).toBe('user-alice');
    expect(recovered?.personalWalletAddress).toBe('0x1111111111111111111111111111111111111111');
    expect(recovered?.expiry).toBeGreaterThan(Date.now());
  });

  it('rejects tokens with tampered payload or signature', () => {
    const token = generateSessionToken({ userId: 'user-bob' });
    const [payload, signature] = token.split('.');

    // Tampered payload
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'user-admin', expiry: Date.now() + 100000 })).toString('base64url');
    const tamperedToken = `${tamperedPayload}.${signature}`;

    expect(verifySessionToken(tamperedToken)).toBeNull();

    // Tampered signature
    const badSigToken = `${payload}.invalidsignature123`;
    expect(verifySessionToken(badSigToken)).toBeNull();
  });

  it('rejects malformed or empty token strings', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('not-a-token')).toBeNull();
    expect(verifySessionToken('part1.part2.part3')).toBeNull();
  });

  it('rejects expired tokens', () => {
    const expiredPrincipal = {
      userId: 'user-expired',
      expiry: Date.now() - 1000 // 1 second in the past
    };
    const payload = Buffer.from(JSON.stringify(expiredPrincipal)).toString('base64url');
    const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    const expiredToken = `${payload}.${signature}`;

    expect(verifySessionToken(expiredToken)).toBeNull();
  });
});

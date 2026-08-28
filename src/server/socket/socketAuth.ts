import { createHmac, randomBytes } from 'crypto';

export const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');

export interface SessionTokenPrincipal {
  userId: string;
  personalWalletAddress?: string;
  expiry: number;
}

export interface WalletLinkChallenge {
  address: string;
  message: string;
  expiresAt: number;
}

export function generateSessionToken(principal: Omit<SessionTokenPrincipal, 'expiry'>): string {
  const expiry = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = Buffer.from(JSON.stringify({ ...principal, expiry })).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): SessionTokenPrincipal | null {
  try {
    const [payload, signature] = token.split('.');
    if (!payload || !signature) return null;
    const expectedSig = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    if (signature !== expectedSig) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionTokenPrincipal;
    if (!parsed.userId || !parsed.expiry || Date.now() > parsed.expiry) return null;
    return parsed;
  } catch {
    return null;
  }
}

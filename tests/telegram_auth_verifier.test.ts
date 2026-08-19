import { describe, expect, it } from 'vitest';
import * as crypto from 'crypto';
import { verifyTelegramWebAppData } from '../src/core/identity/TelegramAuthVerifier';

describe('TelegramAuthVerifier', () => {
  const botToken = '123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ';
  const testUser = {
    id: 12345,
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    language_code: 'en',
  };

  function generateValidInitData(user: any, authDate: number): { initData: string; hash: string } {
    const urlParams = new URLSearchParams();
    urlParams.set('auth_date', authDate.toString());
    urlParams.set('user', JSON.stringify(user));
    urlParams.set('query_id', 'AAHd-J4DAAAAAN34ngPtI4b2');

    // Sort params
    const keys = Array.from(urlParams.keys()).sort();
    const dataCheckString = keys.map(key => `${key}=${urlParams.get(key)}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    urlParams.set('hash', hash);
    return { initData: urlParams.toString(), hash };
  }

  it('successfully verifies valid initData and extracts user information', () => {
    const authDate = Math.floor(Date.now() / 1000); // current time in seconds
    const { initData } = generateValidInitData(testUser, authDate);

    const result = verifyTelegramWebAppData(initData, botToken);

    expect(result.isValid).toBe(true);
    expect(result.user).toEqual(testUser);
    expect(result.error).toBeUndefined();
  });

  it('fails verification if hash is modified', () => {
    const authDate = Math.floor(Date.now() / 1000);
    const { initData } = generateValidInitData(testUser, authDate);
    const modifiedInitData = initData.replace(/hash=[a-f0-9]+/, 'hash=badhash12345');

    const result = verifyTelegramWebAppData(modifiedInitData, botToken);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Invalid HMAC signature');
  });

  it('fails verification if initData is expired', () => {
    // 25 hours ago
    const authDate = Math.floor(Date.now() / 1000) - (25 * 60 * 60);
    const { initData } = generateValidInitData(testUser, authDate);

    const result = verifyTelegramWebAppData(initData, botToken);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('initData has expired');
  });

  it('fails verification if initData is missing hash', () => {
    const urlParams = new URLSearchParams();
    urlParams.set('auth_date', Math.floor(Date.now() / 1000).toString());
    urlParams.set('user', JSON.stringify(testUser));

    const result = verifyTelegramWebAppData(urlParams.toString(), botToken);

    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Missing hash in initData');
  });

  it('fails verification if initData or botToken is empty', () => {
    expect(verifyTelegramWebAppData('', botToken).isValid).toBe(false);
    expect(verifyTelegramWebAppData('someData', '').isValid).toBe(false);
  });
});

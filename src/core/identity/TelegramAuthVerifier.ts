import * as crypto from 'crypto';

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  added_to_attachment_menu?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface TelegramAuthResult {
  isValid: boolean;
  user?: TelegramUser;
  error?: string;
}

/**
 * Validates the Telegram Mini App initData string against the bot token.
 * Follows the standard Telegram WebApp HMAC-SHA256 verification process.
 */
export function verifyTelegramWebAppData(initData: string, botToken: string): TelegramAuthResult {
  if (!initData || !botToken) {
    return { isValid: false, error: 'Missing initData or botToken' };
  }

  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    
    if (!hash) {
      return { isValid: false, error: 'Missing hash in initData' };
    }

    urlParams.delete('hash');
    
    const keys = Array.from(urlParams.keys());
    keys.sort();

    const dataCheckString = keys.map(key => `${key}=${urlParams.get(key)}`).join('\n');

    // secret_key = HMAC_SHA256(<bot_token>, "WebAppData")
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();

    // hash_result = HMAC_SHA256(<data_check_string>, secret_key)
    const hashResult = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (hashResult !== hash) {
      return { isValid: false, error: 'Invalid HMAC signature' };
    }

    // Check expiration (e.g., 24 hours)
    const authDateStr = urlParams.get('auth_date');
    if (authDateStr) {
      const authDate = parseInt(authDateStr, 10) * 1000;
      if (Date.now() - authDate > 24 * 60 * 60 * 1000) {
        return { isValid: false, error: 'initData has expired' };
      }
    }

    // Parse user object
    const userStr = urlParams.get('user');
    let user: TelegramUser | undefined = undefined;
    if (userStr) {
      user = JSON.parse(userStr);
    }

    return { isValid: true, user };
  } catch (err: any) {
    return { isValid: false, error: `Verification failed: ${err.message}` };
  }
}

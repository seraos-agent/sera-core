import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { DanaClient, DanaConfig } from './DanaClient';
import { DanaTokenResponse } from './types';

export interface ISnapDispatcher {
  executeSnapPost<T = any>(
    endpointPath: string,
    bodyObj: any,
    externalId?: string,
    customHeaders?: Record<string, string | null | undefined>
  ): Promise<{ res: Response; data: T; timestamp: string }>;
  getB2BAccessToken(): Promise<string>;
  getClient(): DanaClient;
  getConfig(): DanaConfig;
}

/**
 * Handles SNAP BI B2B Access Token acquisition and RSA-SHA256 asymmetric HTTP dispatch.
 */
export class DanaSnapDispatcher implements ISnapDispatcher {
  private client: DanaClient;
  private cachedToken: DanaTokenResponse | null = null;
  private readonly tokenFilePath = path.join(process.cwd(), '.data', 'dana_b2b_token.json');

  constructor(client?: DanaClient) {
    this.client = (client && typeof client.getConfig === 'function') ? client : new DanaClient();
  }

  public getClient(): DanaClient {
    return this.client;
  }

  public getConfig(): DanaConfig {
    return this.client.getConfig();
  }

  /**
   * Retrieves a valid B2B Access Token using SNAP BI Asymmetric Signature.
   * Caches token in memory and on disk until 60 seconds before expiration.
   */
  public async getB2BAccessToken(): Promise<string> {
    const now = Date.now();

    // 1. In-memory cache
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60000) {
      return this.cachedToken.accessToken;
    }

    // 2. Disk cache
    try {
      if (fs.existsSync(this.tokenFilePath)) {
        const fileContent = JSON.parse(fs.readFileSync(this.tokenFilePath, 'utf8'));
        if (fileContent && fileContent.expiresAt > now + 60000) {
          this.cachedToken = fileContent;
          console.log('[DanaSnapDispatcher] Reusing active B2B Access Token from cache.');
          return (this.cachedToken as DanaTokenResponse).accessToken;
        }
      }
    } catch {}

    // 3. Fresh token request from DANA
    const config = this.client.getConfig();
    const timestamp = this.client.getTimestamp();
    const signature = this.client.generateAsymmetricSignature(timestamp);

    const endpoint = `${config.baseUrl}/v1.0/access-token/b2b.htm`;
    console.log(`[DanaSnapDispatcher] Requesting B2B Access Token from: ${endpoint}`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TIMESTAMP': timestamp,
        'X-CLIENT-KEY': config.clientId,
        'X-SIGNATURE': signature,
      },
      body: JSON.stringify({
        grantType: 'client_credentials'
      })
    });

    const data = await res.json();
    if (!res.ok || (data.responseCode && !data.responseCode.startsWith('200'))) {
      const errMsg = data.responseMessage || data.error_description || JSON.stringify(data);
      throw new Error(`[DanaSnapDispatcher] Failed to obtain B2B Access Token (${res.status}): ${errMsg}`);
    }

    const expiresIn = Number(data.expiresIn || 900);
    this.cachedToken = {
      accessToken: data.accessToken,
      tokenType: data.tokenType || 'Bearer',
      expiresIn,
      expiresAt: now + (expiresIn * 1000)
    };

    // Save to disk cache
    try {
      const dir = path.dirname(this.tokenFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.tokenFilePath, JSON.stringify(this.cachedToken, null, 2), 'utf8');
    } catch {}

    console.log('[DanaSnapDispatcher] B2B Access Token successfully acquired and cached.');
    return this.cachedToken.accessToken;
  }

  /**
   * Dispatches a signed SNAP BI Asymmetric POST request to DANA API.
   * Handles SHA256 body hashing, RSA-SHA256 signature, headers generation, and JSON parsing.
   */
  public async executeSnapPost<T = any>(
    endpointPath: string,
    bodyObj: any,
    externalId?: string,
    customHeaders?: Record<string, string | null | undefined>
  ): Promise<{ res: Response; data: T; timestamp: string }> {
    const config = this.client.getConfig();
    const url = `${config.baseUrl}${endpointPath}`;
    const timestamp = this.client.getTimestamp();
    const effectiveExternalId = externalId || `EXT-${Date.now()}`;

    const bodyJson = JSON.stringify(bodyObj);
    const bodyHash = crypto.createHash('sha256').update(bodyJson, 'utf8').digest('hex').toLowerCase();

    // String to Sign: HTTPMethod + ":" + EndpointUrl + ":" + LowercaseHex(SHA256(Body)) + ":" + Timestamp
    const stringToSign = `POST:${endpointPath}:${bodyHash}:${timestamp}`;
    const pemKey = DanaClient.formatKeyToPem(config.privateKey, 'RSA PRIVATE');
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign, 'utf8');
    signer.end();
    const signature = signer.sign(pemKey, 'base64');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-TIMESTAMP': timestamp,
      'X-SIGNATURE': signature,
      'X-PARTNER-ID': config.clientId,
      'X-EXTERNAL-ID': effectiveExternalId,
      'CHANNEL-ID': '95221'
    };

    if (customHeaders) {
      for (const [key, value] of Object.entries(customHeaders)) {
        if (value === null || value === undefined) {
          delete headers[key];
        } else {
          headers[key] = value;
        }
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyJson
    });

    const data = (await res.json()) as T;
    return { res, data, timestamp };
  }
}

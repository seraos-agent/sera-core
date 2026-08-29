import { Request, Response, Router } from 'express';
import { SecretManager } from '../../core/secrets/SecretManager';
import { agentManager } from '../AgentManager';

export interface ThreadsConnectionStatus {
  provider: 'THREADS';
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'UNAVAILABLE';
  username?: string;
  name?: string;
  threadsUserId?: string;
  profilePictureUrl?: string;
  connectedAt?: string;
}

export class ThreadsOAuthService {
  constructor(private readonly secretManager: SecretManager) {}

  get appId(): string | undefined {
    return process.env.THREADS_APP_ID;
  }

  get appSecret(): string | undefined {
    return process.env.THREADS_APP_SECRET;
  }

  get redirectUri(): string {
    if (process.env.THREADS_REDIRECT_URI) {
      return process.env.THREADS_REDIRECT_URI;
    }
    const publicUrl = process.env.SERA_PUBLIC_URL?.replace(/\/$/, '') || 'https://api.seraos.xyz';
    const secureUrl = publicUrl.startsWith('http://localhost') ? publicUrl : publicUrl.replace(/^http:\/\//, 'https://');
    return `${secureUrl}/api/auth/threads/callback`;
  }

  async getStatus(sessionId: string): Promise<ThreadsConnectionStatus> {
    if (!this.appId || !this.appSecret) {
      return { provider: 'THREADS', status: 'UNAVAILABLE' };
    }
    try {
      const token = await this.secretManager.getSecret(`THREADS_TOKEN_${sessionId}`);
      if (token) {
        let profile: any = {};
        const profileStr = await this.secretManager.getSecret(`THREADS_PROFILE_${sessionId}`);
        if (profileStr) {
          try {
            profile = JSON.parse(profileStr);
          } catch {}
        }
        return {
          provider: 'THREADS',
          status: 'CONNECTED',
          username: profile.username || undefined,
          name: profile.name || undefined,
          threadsUserId: profile.id || undefined,
          profilePictureUrl: profile.threads_profile_picture_url || undefined,
          connectedAt: profile.connectedAt || undefined,
        };
      }
      return { provider: 'THREADS', status: 'NOT_CONNECTED' };
    } catch {
      return { provider: 'THREADS', status: 'NOT_CONNECTED' };
    }
  }

  beginAuthorization(sessionId: string, returnUrl?: string): string {
    if (!this.appId) {
      throw new Error('THREADS_APP_ID is not configured in the environment.');
    }
    const scope = 'threads_basic,threads_content_publish,threads_read_replies,threads_manage_replies,threads_manage_mentions,threads_keyword_search,threads_manage_insights,threads_delete';
    const statePayload = JSON.stringify({
      sessionId,
      returnUrl: returnUrl || 'https://app.seraos.xyz',
      nonce: Math.random().toString(36).substring(7)
    });
    const state = Buffer.from(statePayload).toString('base64');

    const authUrl = new URL('https://threads.net/oauth/authorize');
    authUrl.searchParams.append('client_id', this.appId);
    authUrl.searchParams.append('redirect_uri', this.redirectUri);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);

    // #weblink prevents Android/iOS from intercepting the URL as an App Link
    return `${authUrl.toString()}#weblink`;
  }

  async disconnect(sessionId: string): Promise<ThreadsConnectionStatus> {
    try {
      await this.secretManager.deleteSecret(`THREADS_TOKEN_${sessionId}`);
      await this.secretManager.deleteSecret(`THREADS_PROFILE_${sessionId}`);
    } catch (e) {
      console.warn(`[ThreadsOAuthService] Failed to delete token for ${sessionId}:`, e);
    }
    const instance = agentManager.getOrCreateInstance(sessionId);
    if (instance?.runtime?.capabilityCatalog) {
      instance.runtime.capabilityCatalog.deactivateConnector('threads');
    }
    return { provider: 'THREADS', status: 'NOT_CONNECTED' };
  }
}

export function createThreadsAuthRouter(
  threadsOAuthService: ThreadsOAuthService,
  secretManager: SecretManager,
  onConnected?: (sessionId: string) => void
): Router {
  const router = Router();

  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;

  // Interstitial redirect initiation endpoint
  router.get('/', (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const returnUrl = (req.query.returnUrl as string) || req.headers.referer || req.headers.origin || 'https://app.seraos.xyz';
    if (!sessionId) {
      return res.status(400).send('Missing sessionId parameter.');
    }

    try {
      const targetUrl = threadsOAuthService.beginAuthorization(sessionId, returnUrl);

      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connecting to Threads...</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
      background: #0a0a0a; color: #e0e0e0;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    .card {
      max-width: 380px; width: 100%; text-align: center;
      background: #161616; border: 1px solid #2a2a2a;
      border-radius: 20px; padding: 40px 28px;
    }
    .spinner {
      width: 36px; height: 36px; margin: 0 auto 20px;
      border: 3px solid #333; border-top-color: #fff;
      border-radius: 50%; animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 18px; font-weight: 600; margin-bottom: 10px; }
    p { font-size: 13px; color: #888; line-height: 1.6; margin-bottom: 24px; }
    .btn {
      display: inline-block; padding: 12px 28px;
      background: #fff; color: #000; border-radius: 12px;
      text-decoration: none; font-weight: 600; font-size: 14px;
      transition: opacity .2s;
    }
    .btn:active { opacity: .7; }
    .hint { font-size: 11px; color: #555; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h2>Connecting to Threads...</h2>
    <p>You will be directed to Meta to authorize SERA on your Threads account.</p>
    <a id="manual" class="btn" href="${targetUrl}">Continue to Threads</a>
    <p class="hint">If not redirected automatically, tap the button above.</p>
  </div>
  <script>
    setTimeout(function() {
      window.location.replace("${targetUrl}");
    }, 500);
  </script>
</body>
</html>`);
    } catch (err: any) {
      res.status(500).send(err.message || 'Failed to initialize Threads authorization.');
    }
  });

  // OAuth Callback
  router.get('/callback', async (req: Request, res: Response) => {
    const redirectUri = threadsOAuthService.redirectUri;
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send(`Authorization failed: ${error}`);
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).send('Authorization code missing.');
    }

    if (!state || typeof state !== 'string') {
      return res.status(400).send('State missing or invalid.');
    }

    if (!appId || !appSecret) {
      return res.status(500).send('THREADS_APP_ID or THREADS_APP_SECRET is not configured.');
    }

    try {
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      const sessionId = decodedState.sessionId;
      const returnUrl = decodedState.returnUrl || 'https://app.seraos.xyz';

      if (!sessionId) {
        throw new Error('sessionId not found in state payload.');
      }

      // 1. Exchange authorization code for short-lived access token
      const tokenResponse = await fetch('https://graph.threads.net/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: appId,
          client_secret: appSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        const errText = await tokenResponse.text();
        throw new Error(`Failed to exchange code for token: ${errText}`);
      }

      const tokenData = await tokenResponse.json();
      const shortLivedToken = tokenData.access_token;

      // 2. Exchange short-lived token for long-lived token (60 days)
      const longLivedResponse = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`);
      
      if (!longLivedResponse.ok) {
        const errText = await longLivedResponse.text();
        throw new Error(`Failed to exchange for long-lived token: ${errText}`);
      }

      const longLivedData = await longLivedResponse.json();
      const longLivedToken = longLivedData.access_token;

      // 2b. Fetch Threads User Profile (username, name, ID, profile picture)
      let profile: any = {};
      try {
        const meRes = await fetch(`https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url&access_token=${longLivedToken}`);
        if (meRes.ok) {
          profile = await meRes.json();
          profile.connectedAt = new Date().toISOString();
          console.log(`[ThreadsAuth] Connected Threads profile for ${sessionId}: @${profile.username} (${profile.id})`);
        } else {
          console.warn('[ThreadsAuth] Threads profile request returned status:', meRes.status);
        }
      } catch (err: any) {
        console.warn('[ThreadsAuth] Could not fetch Threads user profile:', err.message);
      }

      // 3. Persist the long-lived token and profile metadata in SecretManager for this specific sessionId
      await secretManager.setSecret(`THREADS_TOKEN_${sessionId}`, longLivedToken);
      if (profile.username || profile.id) {
        await secretManager.setSecret(`THREADS_PROFILE_${sessionId}`, JSON.stringify(profile));
      }

      // 4. Activate the connector in CapabilityCatalog
      const instance = agentManager.getOrCreateInstance(sessionId);
      if (instance?.runtime?.capabilityCatalog) {
        instance.runtime.capabilityCatalog.activateConnector('threads');
        const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
        if (instance.eventBus) {
          instance.eventBus.emit({
            type: 'connector:status_changed',
            payload: summaries
          } as any);
        }
      }

      if (onConnected) {
        onConnected(sessionId);
      }

      // 5. Render success page
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Threads Connected</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif;
      background: #0a0a0a; color: #e0e0e0;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    .card {
      max-width: 380px; width: 100%; text-align: center;
      background: #161616; border: 1px solid #2a2a2a;
      border-radius: 20px; padding: 40px 28px;
    }
    .icon {
      width: 50px; height: 50px; margin: 0 auto 16px;
      border-radius: 50%; background: rgba(16, 185, 129, 0.15);
      color: #10b981; display: flex; align-items: center; justify-content: center;
      font-size: 24px; font-weight: bold;
    }
    h2 { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #fff; }
    p { font-size: 13px; color: #888; line-height: 1.5; margin-bottom: 20px; }
    .btn {
      display: inline-block; padding: 10px 24px;
      background: #fff; color: #000; border-radius: 10px;
      text-decoration: none; font-weight: 600; font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✓</div>
    <h2>Threads Connected!</h2>
    <p>SERA can now publish and manage posts on your Threads account.</p>
    <a id="returnBtn" class="btn" href="${returnUrl}">Return to SERA</a>
  </div>
  <script>
    if (window.opener && window.opener !== window) {
      window.opener.postMessage({ type: 'OAUTH_SUCCESS', connector: 'threads' }, '*');
      setTimeout(function() { window.close(); }, 1200);
    } else {
      setTimeout(function() { window.location.href = '${returnUrl}'; }, 2000);
    }
  </script>
</body>
</html>`);
    } catch (err: any) {
      console.error('[ThreadsAuth] OAuth Error:', err.message);
      res.status(500).send(`Authentication flow failed: ${err.message}`);
    }
  });

  return router;
}

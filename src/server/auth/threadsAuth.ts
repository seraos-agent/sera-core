import { Request, Response, Router } from 'express';
import { SecretManager } from '../../core/secrets/SecretManager';
import { agentManager } from '../AgentManager';

export function createThreadsAuthRouter(secretManager: SecretManager): Router {
  const router = Router();

  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  
  // Note: Must match exactly what is configured in the Meta Developer Portal
  router.get('/', (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = process.env.THREADS_REDIRECT_URI || `${protocol}://${host}/api/auth/threads/callback`;
    if (!appId) {
      return res.status(500).send('THREADS_APP_ID is not configured in the environment.');
    }

    const scope = 'threads_basic,threads_content_publish,threads_read_replies,threads_manage_replies,threads_manage_mentions,threads_keyword_search,threads_manage_insights,threads_delete';
    
    // Parse sessionId from query and encode it into state
    const sessionId = req.query.sessionId as string;
    const returnUrl = req.query.returnUrl as string || req.headers.referer || req.headers.origin || 'https://app.seraos.xyz';
    if (!sessionId) {
      return res.status(400).send('Missing sessionId parameter.');
    }
    const statePayload = JSON.stringify({ sessionId, returnUrl, nonce: Math.random().toString(36).substring(7) });
    const state = Buffer.from(statePayload).toString('base64');
    
    // Redirect user to Meta authorization page
    // NOTE: We serve an interstitial HTML page instead of a 302 redirect.
    // On mobile, a 302 to threads.net triggers the OS app chooser (Threads app vs Browser).
    // If the user picks the Threads app, OAuth breaks. JavaScript-based navigation
    // from our own domain avoids triggering the deep-link intent resolver on most devices.
    const authUrl = new URL('https://threads.net/oauth/authorize');
    authUrl.searchParams.append('client_id', appId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);

    const targetUrl = authUrl.toString();

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
    <h2>Redirecting to Threads...</h2>
    <p>You'll be asked to authorize SERA to connect with your Threads account.</p>
    <a id="manual" class="btn" href="${targetUrl}">Continue to Threads</a>
    <p class="hint">If nothing happens, tap the button above.</p>
  </div>
  <script>
    // Use location.replace to avoid triggering the OS deep-link intent resolver.
    // A short delay ensures the interstitial page renders first.
    setTimeout(function() {
      window.location.replace("${targetUrl}");
    }, 800);
  </script>
</body>
</html>`);
  });

  router.get('/callback', async (req: Request, res: Response) => {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const redirectUri = process.env.THREADS_REDIRECT_URI || `${protocol}://${host}/api/auth/threads/callback`;
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
      // Decode state to get sessionId
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

      // 2. Exchange short-lived token for long-lived token
      const longLivedResponse = await fetch(`https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`);
      
      if (!longLivedResponse.ok) {
        const errText = await longLivedResponse.text();
        throw new Error(`Failed to exchange for long-lived token: ${errText}`);
      }

      const longLivedData = await longLivedResponse.json();
      const longLivedToken = longLivedData.access_token;

      // 3. Persist the long-lived token using SecretManager
      // Scoped to the specific user session
      await secretManager.setSecret(`THREADS_TOKEN_${sessionId}`, longLivedToken);

      // 4. Automatically activate the connector in the backend
      const instance = agentManager.getOrCreateInstance(sessionId);
      if (instance?.runtime?.capabilityCatalog) {
        instance.runtime.capabilityCatalog.activateConnector('threads');
        const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
        
        // Push status update to the frontend if event bus is available
        if (instance.eventBus) {
           instance.eventBus.emit({
             type: 'connector:status_changed',
             payload: summaries
           } as any);
        }
      }

      // 5. Redirect back to frontend
      res.send(`
        <html>
          <body>
            <h2>Threads Connected Successfully!</h2>
            <p>Sera now has access to post to your personal Threads account.</p>
            <script>
              let closed = false;
              if (window.opener && window.opener !== window) {
                window.opener.postMessage({ type: 'OAUTH_SUCCESS', connector: 'threads' }, '*');
                window.close();
                closed = true;
              }
              setTimeout(() => {
                if (!closed) {
                  window.location.href = '${returnUrl}';
                }
              }, 1500);
            </script>
            <div style="margin-top: 20px;">
              <a href="${returnUrl}" style="display:inline-block; padding:10px 20px; background:#000; color:#fff; text-decoration:none; border-radius:8px; font-family:sans-serif;">Return to SERA</a>
            </div>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error('[ThreadsAuth] OAuth Error:', err.message);
      res.status(500).send(`Authentication flow failed: ${err.message}`);
    }
  });

  return router;
}

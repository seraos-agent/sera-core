import { Request, Response, Router } from 'express';
import { SecretManager } from '../../core/secrets/SecretManager';

export function createThreadsAuthRouter(secretManager: SecretManager): Router {
  const router = Router();

  const appId = process.env.THREADS_APP_ID;
  const appSecret = process.env.THREADS_APP_SECRET;
  
  // Note: Must match exactly what is configured in the Meta Developer Portal
  const redirectUri = process.env.THREADS_REDIRECT_URI || 'https://localhost:3001/api/auth/threads/callback';

  router.get('/', (req: Request, res: Response) => {
    if (!appId) {
      return res.status(500).send('THREADS_APP_ID is not configured in the environment.');
    }

    const scope = 'threads_basic,threads_content_publish,threads_read_replies,threads_manage_replies,threads_manage_mentions,threads_keyword_search,threads_manage_insights,threads_delete';
    const state = Math.random().toString(36).substring(7); // Prevent CSRF
    
    // Redirect user to Meta authorization page
    const authUrl = new URL('https://threads.net/oauth/authorize');
    authUrl.searchParams.append('client_id', appId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);

    res.redirect(authUrl.toString());
  });

  router.get('/callback', async (req: Request, res: Response) => {
    const { code, state, error } = req.query;

    if (error) {
      return res.status(400).send(`Authorization failed: ${error}`);
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).send('Authorization code missing.');
    }

    if (!appId || !appSecret) {
      return res.status(500).send('THREADS_APP_ID or THREADS_APP_SECRET is not configured.');
    }

    try {
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
      // For MVP, we save it globally.
      await secretManager.setSecret('THREADS_ACCESS_TOKEN', longLivedToken);

      res.send(`
        <html>
          <body>
            <h2>Threads Connected Successfully!</h2>
            <p>Sera now has a long-lived access token to post to Threads.</p>
            <script>
              setTimeout(() => {
                window.close();
              }, 3000);
            </script>
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

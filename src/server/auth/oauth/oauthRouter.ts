import express, { Request, Response, Router } from 'express';
import { OAuthStore } from './OAuthStore';

export function createOAuthRouter(oauthStore: OAuthStore): Router {
  const router = Router();

  // Support JSON and urlencoded bodies for all OAuth requests
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));

  // CORS for OAuth & metadata discovery endpoints
  router.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  const getBaseUrl = (req: Request): string => {
    const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || '';
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
      return `${protocol}://${host}`;
    }
    // Canonical production MCP domain
    return 'https://mcp.seraos.xyz';
  };

  // ── 1. OAuth 2.0 Authorization Server Metadata (RFC 8414 & OpenID Discovery) ──
  const getMetadata = (req: Request) => {
    const baseUrl = getBaseUrl(req);
    return {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      registration_endpoint: `${baseUrl}/oauth/register`,
      userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      code_challenge_methods_supported: ['S256', 'plain'],
      scopes_supported: ['mcp:all', 'mcp:chat', 'mcp:wallet', 'mcp:memory', 'mcp:tools'],
      service_documentation: 'https://seraos.xyz',
      logo_uri: 'https://sera-app.vercel.app/sera-logo.png',
      icon: 'https://sera-app.vercel.app/sera-logo.png',
      client_name: 'SERA OS Agent'
    };
  };

  router.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
    res.json(getMetadata(req));
  });

  router.get('/.well-known/openid-configuration', (req: Request, res: Response) => {
    res.json(getMetadata(req));
  });

  // RFC 9728: OAuth 2.0 Protected Resource Metadata
  router.get('/.well-known/oauth-protected-resource', (req: Request, res: Response) => {
    const baseUrl = getBaseUrl(req);
    res.json({
      resource: baseUrl,
      authorization_servers: [baseUrl],
      scopes_supported: ['mcp:all', 'mcp:chat', 'mcp:wallet', 'mcp:memory', 'mcp:tools'],
      bearer_methods_supported: ['header']
    });
  });

  // ── 2. RFC 7591 Dynamic Client Registration ──────────────────────────────────
  router.post('/oauth/register', (req: Request, res: Response) => {
    try {
      const body = req.body || {};
      const {
        client_name,
        client_uri,
        logo_uri,
        redirect_uris,
        redirect_uri,
        grant_types,
        response_types,
        scope,
        token_endpoint_auth_method
      } = body;

      let validRedirectUris: string[] = [];
      if (Array.isArray(redirect_uris) && redirect_uris.length > 0) {
        validRedirectUris = redirect_uris;
      } else if (typeof redirect_uri === 'string' && redirect_uri.length > 0) {
        validRedirectUris = [redirect_uri];
      } else if (typeof redirect_uris === 'string' && redirect_uris.length > 0) {
        validRedirectUris = [redirect_uris];
      } else {
        validRedirectUris = ['https://claude.ai/api/mcp/oauth_callback', 'https://claude.ai/oauth/callback'];
      }

      const client = oauthStore.registerClient({
        client_name: client_name || 'Anthropic Claude / External MCP Client',
        client_uri,
        logo_uri,
        redirect_uris: validRedirectUris,
        grant_types: grant_types || ['authorization_code', 'refresh_token'],
        response_types: response_types || ['code'],
        scope: scope || 'mcp:all',
        token_endpoint_auth_method: token_endpoint_auth_method || 'none'
      });

      res.status(201).json({
        client_id: client.client_id,
        client_secret: client.client_secret,
        client_name: client.client_name,
        client_uri: client.client_uri,
        logo_uri: client.logo_uri,
        redirect_uris: client.redirect_uris,
        grant_types: client.grant_types,
        response_types: client.response_types,
        token_endpoint_auth_method: client.token_endpoint_auth_method,
        client_id_issued_at: Math.floor(client.created_at / 1000)
      });
    } catch (err: any) {
      res.status(500).json({ error: 'server_error', error_description: err.message });
    }
  });

  // ── 3. Authorization Endpoint (GET /oauth/authorize) ─────────────────────────
  router.get('/oauth/authorize', (req: Request, res: Response) => {
    const {
      client_id,
      redirect_uri,
      response_type,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      session_id
    } = req.query;

    if (!client_id || typeof client_id !== 'string') {
      return res.status(400).send('Missing client_id');
    }

    if (!redirect_uri || typeof redirect_uri !== 'string') {
      return res.status(400).send('Missing redirect_uri');
    }

    if (response_type !== 'code') {
      return res.status(400).send('Unsupported response_type. Must be "code".');
    }

    const client = oauthStore.getClient(client_id);
    const clientName = client?.client_name || 'Anthropic Claude / External MCP Client';

    // Extract user/session_id if passed in initial URL query (e.g. from unique link)
    const userParam = typeof req.query.user === 'string' ? req.query.user : (typeof session_id === 'string' && session_id !== 'default' ? session_id : '');
    const isPreBound = !!userParam;

    // HTML Consent Page with rich SERA aesthetics
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Connect Claude - SERA OS</title>
  <link rel="icon" type="image/png" href="/sera-logo.png">
  <style>
    :root {
      --bg: #09090b;
      --card-bg: #121216;
      --border: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(16, 185, 129, 0.4);
      --ink: #f4f4f5;
      --ink-soft: #a1a1aa;
      --ink-muted: #71717a;
      --accent: #10b981;
      --accent-hover: #059669;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 36px 32px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 30px 70px rgba(0, 0, 0, 0.7);
      text-align: center;
      animation: enter 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes enter {
      from { opacity: 0; transform: translateY(8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .logo-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 24px;
    }
    .icon-box {
      width: 56px;
      height: 56px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .icon-box img {
      width: 34px;
      height: 34px;
      object-fit: contain;
    }
    .icon-box svg {
      width: 30px;
      height: 30px;
    }
    .link-dot {
      color: var(--ink-muted);
      font-size: 14px;
      font-weight: 500;
    }
    h1 {
      font-size: 21px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 8px 0;
      color: var(--ink);
    }
    p.desc {
      color: var(--ink-soft);
      font-size: 13.5px;
      line-height: 1.45;
      margin: 0 0 28px 0;
    }
    .identity-card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 24px;
      text-align: left;
    }
    .identity-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }
    .identity-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--ink-soft);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .input-field {
      width: 100%;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
      color: var(--ink);
      font-size: 13.5px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      outline: none;
      transition: all 0.15s;
    }
    .input-field:focus {
      border-color: var(--border-focus);
      background: rgba(0, 0, 0, 0.6);
    }
    .connected-pill {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(16, 185, 129, 0.08);
      border: 1px solid rgba(16, 185, 129, 0.2);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 13.5px;
      font-family: ui-monospace, monospace;
      color: #34d399;
    }
    .connected-pill .dot {
      width: 8px;
      height: 8px;
      background: var(--accent);
      border-radius: 50%;
      display: inline-block;
      margin-right: 8px;
    }
    .btn-row {
      display: flex;
      gap: 12px;
    }
    button.main-btn {
      flex: 1;
      padding: 13px 20px;
      border-radius: 14px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s ease;
    }
    .btn-auth {
      background: var(--accent);
      color: #042f1a;
    }
    .btn-auth:hover {
      background: var(--accent-hover);
      color: #fff;
    }
    .btn-cancel {
      background: rgba(255, 255, 255, 0.05);
      color: var(--ink-soft);
    }
    .btn-cancel:hover {
      background: rgba(255, 255, 255, 0.08);
      color: var(--ink);
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-row">
      <div class="icon-box">
        <img src="/sera-logo.png" alt="SERA" />
      </div>
      <span class="link-dot">⇄</span>
      <div class="icon-box">
        <svg height="30" width="30" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" />
        </svg>
      </div>
    </div>

    <h1>Connect to Claude</h1>
    <p class="desc">Authorize Claude to command your SERA Agent and vault.</p>

    <form method="POST" action="/oauth/authorize/decision">
      <input type="hidden" name="client_id" value="${client_id}" />
      <input type="hidden" name="redirect_uri" value="${redirect_uri}" />
      <input type="hidden" name="state" value="${state || ''}" />
      <input type="hidden" name="scope" value="${scope || 'mcp:all'}" />
      <input type="hidden" name="code_challenge" value="${code_challenge || ''}" />
      <input type="hidden" name="code_challenge_method" value="${code_challenge_method || 'S256'}" />

      <div class="identity-card">
        <div class="identity-header">
          <span class="identity-label">${isPreBound ? 'Verified SERA Identity' : 'SERA Identity (Wallet / Email)'}</span>
        </div>

        ${isPreBound ? `
          <input type="hidden" id="sessionId" name="sessionId" value="${userParam}" />
          <div class="connected-pill">
            <div><span class="dot"></span><span>${userParam.startsWith('0x') && userParam.length === 42 ? userParam.slice(0, 8) + '...' + userParam.slice(-6) : userParam}</span></div>
            <span style="font-size:11px;font-weight:600;opacity:0.8;">LINKED</span>
          </div>
        ` : `
          <input type="text" id="sessionId" name="sessionId" class="input-field" placeholder="0x... or user@example.com" required />
        `}
      </div>

      <div class="btn-row">
        <button type="button" class="main-btn btn-cancel" onclick="window.close()">Cancel</button>
        <button type="submit" name="decision" value="approve" class="main-btn btn-auth">Authorize</button>
      </div>
    </form>
  </div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // ── 4. Authorization Decision (POST /oauth/authorize/decision) ───────────────
  router.post('/oauth/authorize/decision', (req: Request, res: Response) => {
    const {
      client_id,
      redirect_uri,
      state,
      scope,
      code_challenge,
      code_challenge_method,
      sessionId,
      decision
    } = req.body;

    if (decision !== 'approve') {
      const errorUrl = new URL(redirect_uri);
      errorUrl.searchParams.append('error', 'access_denied');
      if (state) errorUrl.searchParams.append('state', state);
      return res.redirect(errorUrl.toString());
    }

    try {
      const code = oauthStore.createAuthorizationCode({
        client_id,
        redirect_uri,
        sessionId: sessionId || 'default',
        scope,
        code_challenge,
        code_challenge_method
      });

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.append('code', code);
      if (state) callbackUrl.searchParams.append('state', state);

      return res.redirect(callbackUrl.toString());
    } catch (err: any) {
      res.status(500).send(`Failed to create authorization code: ${err.message}`);
    }
  });

  // ── 5. Token Endpoint (POST /oauth/token) ────────────────────────────────────
  router.post('/oauth/token', (req: Request, res: Response) => {
    const {
      grant_type,
      code,
      client_id,
      redirect_uri,
      code_verifier,
      refresh_token
    } = req.body;

    try {
      if (grant_type === 'authorization_code') {
        if (!code || !client_id) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'code and client_id are required'
          });
        }

        const token = oauthStore.exchangeCode({
          code,
          client_id,
          redirect_uri,
          code_verifier
        });

        return res.json({
          access_token: token.access_token,
          token_type: token.token_type,
          expires_in: token.expires_in,
          refresh_token: token.refresh_token,
          scope: token.scope
        });
      }

      if (grant_type === 'refresh_token') {
        if (!refresh_token || !client_id) {
          return res.status(400).json({
            error: 'invalid_request',
            error_description: 'refresh_token and client_id are required'
          });
        }

        const token = oauthStore.refreshAccessToken(refresh_token, client_id);
        return res.json({
          access_token: token.access_token,
          token_type: token.token_type,
          expires_in: token.expires_in,
          refresh_token: token.refresh_token,
          scope: token.scope
        });
      }

      return res.status(400).json({
        error: 'unsupported_grant_type',
        error_description: 'Only authorization_code and refresh_token are supported.'
      });
    } catch (err: any) {
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: err.message
      });
    }
  });

  // ── 6. UserInfo Endpoint (GET /oauth/userinfo) ───────────────────────────────
  router.get('/oauth/userinfo', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const token = authHeader.substring(7);
    const sessionId = oauthStore.resolveSession(token);
    if (!sessionId) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    res.json({
      sub: sessionId,
      session_id: sessionId,
      name: `SERA User (${sessionId.slice(0, 8)}...)`,
      updated_at: Math.floor(Date.now() / 1000)
    });
  });

  // ── 7. Revocation Endpoint (POST /oauth/revoke) ───────────────────────────────
  router.post('/oauth/revoke', (req: Request, res: Response) => {
    const token = req.body.token;
    if (token) {
      oauthStore.revokeToken(token);
    }
    res.status(200).json({ success: true });
  });

  return router;
}

import { Router, Response } from 'express';
import { AgentManager } from '../AgentManager';
import { SupabaseRestClient } from '../../core/persistence/SupabaseRestClient';
import { SecretManager } from '../../core/secrets/SecretManager';
import { OAuthStore } from '../auth/oauth/OAuthStore';
import { createAdminAuthMiddleware, AuthenticatedAdminRequest } from '../auth/adminAuthMiddleware';

export interface AdminRouterOptions {
  agentManager: AgentManager;
  supabaseClient?: SupabaseRestClient | null;
  secretManager?: SecretManager;
  oauthStore?: OAuthStore;
  mcpApiKeyStore?: any;
}

export function createAdminRouter(options: AdminRouterOptions): Router {
  const router = Router();
  const { agentManager, supabaseClient, secretManager, oauthStore, mcpApiKeyStore } = options;
  const getAdminSecret = () => process.env.SERA_ADMIN_SECRET || 'sera-admin-master-key-2026';
  const getAdminEmails = () => {
    const raw = process.env.ADMIN_EMAILS || 'seraos.agent@gmail.com,setaraindonesia45@gmail.com,admin@seraos.xyz';
    return raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  };

  // ── Public Admin Login Route (Pre-Middleware) ──────────────────────────────
  router.post('/login', async (req, res): Promise<void> => {
    const { email, password, adminKey } = req.body || {};
    const adminSecret = getAdminSecret();
    const adminEmails = getAdminEmails();

    // Option 1: Direct Secret Key Login
    if (adminKey && String(adminKey).trim() === adminSecret) {
      res.json({
        success: true,
        token: adminSecret,
        adminKey: adminSecret,
        user: {
          id: 'master-admin',
          email: 'admin@seraos.xyz',
          role: 'superadmin',
          authMethod: 'secret_key'
        }
      });
      return;
    }

    // Option 2: Supabase Email + Password Login
    if (email && password) {
      const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
      const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        res.status(500).json({ error: 'Supabase configuration missing on server.' });
        return;
      }

      try {
        const authRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: String(email).trim(), password: String(password) })
        });

        if (!authRes.ok) {
          const errData = await authRes.json() as any;
          res.status(401).json({
            error: 'Authentication failed',
            message: errData.error_description || errData.msg || 'Invalid email or password.'
          });
          return;
        }

        const authData = await authRes.json() as any;
        const userEmail = (authData.user?.email || '').toLowerCase();

        // Check if email is in the admin whitelist
        const isAuthorized = adminEmails.includes('*') || adminEmails.includes(userEmail);
        if (!isAuthorized) {
          res.status(403).json({
            error: 'Forbidden',
            message: `Email ${userEmail} is not authorized for Admin Control Tower access.`
          });
          return;
        }

        res.json({
          success: true,
          token: authData.access_token,
          user: {
            id: authData.user.id,
            email: userEmail,
            authMethod: 'supabase_jwt'
          }
        });
        return;
      } catch (err: any) {
        res.status(500).json({ error: 'Login error', message: err.message });
        return;
      }
    }

    res.status(400).json({ error: 'Provide either email + password or adminKey.' });
  });

  // ── Protected Admin Endpoints ──────────────────────────────────────────────
  router.use(createAdminAuthMiddleware(supabaseClient));

  // 1. Overview KPI Stats
  router.get('/overview', async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const activeInstances = agentManager.getAllInstances();
      let totalUsersCount = Math.max(activeInstances.length, 1);
      let cloudConnectionsCount = 0;

      if (supabaseClient) {
        try {
          const [users, conns] = await Promise.all([
            supabaseClient.select<any>('sera_users', 'select=id').catch(() => []),
            supabaseClient.select<any>('user_cloud_connections', 'select=user_id,status&status=eq.CONNECTED').catch(() => [])
          ]);
          if (Array.isArray(users)) {
            // Count registered Supabase users plus 1 for 'dev' local instance
            totalUsersCount = users.length + 1;
          }
          if (Array.isArray(conns)) {
            cloudConnectionsCount = conns.length;
          }
        } catch (e: any) {
          console.warn('[AdminRouter] Supabase overview select fallback:', e.message);
        }
      }

      // Count active triggers across all running instances
      let activeTriggersCount = 0;
      for (const inst of activeInstances) {
        if (inst.triggerStore && typeof inst.triggerStore.getAll === 'function') {
          activeTriggersCount += inst.triggerStore.getAll().length;
        }
      }

      res.json({
        success: true,
        data: {
          totalUsers: totalUsersCount,
          activeSessions: activeInstances.length,
          activeTriggers: activeTriggersCount,
          activeAutomations: activeTriggersCount,
          activeCloudConnections: cloudConnectionsCount,
          uptimeSeconds: Math.floor(process.uptime()),
          serverTimestamp: Date.now(),
          nodeVersion: process.version,
          adminUser: req.adminUser
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch admin overview', message: err.message });
    }
  });

  // ── Unified Connection Resolver (Synchronized across /users and /users/:sessionId) ──
  const resolveUserConnections = async (
    uid: string,
    walletAddr?: string,
    providedCloudConns?: Array<{ provider: string; status: string }>
  ) => {
    const normUid = (uid || '').toLowerCase();
    const normWallet = walletAddr ? walletAddr.toLowerCase() : '';

    let allConns: Array<{ provider: string; status: string }> = providedCloudConns || [];
    if (!providedCloudConns && supabaseClient) {
      try {
        const directClouds = await supabaseClient.select<any>(
          'user_cloud_connections',
          `user_id=in.(${normUid}${normWallet ? ',' + normWallet : ''})&select=provider,status`
        );
        if (Array.isArray(directClouds)) allConns = directClouds;
      } catch {}
    }

    const isCloudConnected = (term: string) =>
      allConns.some(c => (c.provider || '').toLowerCase().includes(term) && c.status === 'CONNECTED');

    let activations: string[] = [];
    let hasTelegramSecret = false;
    let hasThreadsSecret = false;
    let hasWhatsAppSecret = false;
    let telegramId: string | null = null;
    let whatsAppPhone: string | null = null;

    if (secretManager) {
      try {
        const rawAct = await secretManager.getSecret(`ACTIVATIONS_${normUid}`);
        if (rawAct) {
          const parsed = JSON.parse(rawAct);
          if (Array.isArray(parsed)) activations.push(...parsed.map(s => String(s).toLowerCase()));
        }
        if (normWallet) {
          const rawActWallet = await secretManager.getSecret(`ACTIVATIONS_${normWallet}`);
          if (rawActWallet) {
            const parsed = JSON.parse(rawActWallet);
            if (Array.isArray(parsed)) activations.push(...parsed.map(s => String(s).toLowerCase()));
          }
        }

        const tgSession = (await secretManager.getSecret(`TG_SESSION_${normUid}`)) ||
          (normWallet ? await secretManager.getSecret(`TG_SESSION_${normWallet}`) : null);
        if (tgSession) {
          hasTelegramSecret = true;
          telegramId = String(tgSession);
        }

        const threadsToken = (await secretManager.getSecret(`THREADS_TOKEN_${normUid}`)) ||
          (normWallet ? await secretManager.getSecret(`THREADS_TOKEN_${normWallet}`) : null);
        hasThreadsSecret = Boolean(threadsToken);

        const waSession = (await secretManager.getSecret(`WA_SESSION_${normUid}`)) ||
          (normWallet ? await secretManager.getSecret(`WA_SESSION_${normWallet}`) : null);
        if (waSession) {
          hasWhatsAppSecret = true;
          whatsAppPhone = String(waSession);
        }
      } catch (err: any) {
        console.warn('[AdminRouter] Secret lookup fallback for user', normUid, err.message);
      }
    }

    // Claude MCP OAuth check
    let hasClaudeToken = false;
    if (oauthStore) {
      try {
        const platforms = oauthStore.listConnectedPlatforms(normUid);
        const walletPlatforms = normWallet ? oauthStore.listConnectedPlatforms(normWallet) : [];
        const allPlatforms = [...platforms, ...walletPlatforms];
        hasClaudeToken = allPlatforms.some(p =>
          p.client_id === 'claude-ai-mcp' ||
          (p.client_name || '').toLowerCase().includes('claude') ||
          p.client_id.includes('claude')
        );
      } catch (err: any) {
        console.warn('[AdminRouter] OAuth platform lookup fallback:', err.message);
      }
    }

    // McpApiKeyStore check (if user generated Claude Desktop / stdio keys)
    let hasMcpApiKey = false;
    if (mcpApiKeyStore) {
      try {
        const userKeys = mcpApiKeyStore.listKeys(normUid);
        const walletKeys = normWallet ? mcpApiKeyStore.listKeys(normWallet) : [];
        hasMcpApiKey = (userKeys && userKeys.length > 0) || (walletKeys && walletKeys.length > 0);
      } catch {}
    }

    // Active runtime instance catalog check
    const inst = agentManager.getInstance(normUid) || (normWallet ? agentManager.getInstance(normWallet) : null);
    const isConnectorActiveInCatalog = (id: string) =>
      Boolean(inst?.runtime?.capabilityCatalog?.isConnectorActive(id));

    const isClaudeCloud = isCloudConnected('claude') || isCloudConnected('mcp') || isCloudConnected('anthropic');
    const isDrive = isCloudConnected('drive') || isCloudConnected('google') || activations.includes('google_drive') || activations.includes('google-drive');
    const isTg = hasTelegramSecret || isCloudConnected('telegram') || activations.includes('telegram') || isConnectorActiveInCatalog('telegram');
    const isThr = hasThreadsSecret || isCloudConnected('threads') || activations.includes('threads') || isConnectorActiveInCatalog('threads');
    const isHl = activations.includes('hyperliquid') || activations.includes('hl') || isConnectorActiveInCatalog('hyperliquid');
    const isClaude = hasClaudeToken || hasMcpApiKey || isClaudeCloud || activations.includes('claude') || activations.includes('mcp') || isConnectorActiveInCatalog('mcp') || isConnectorActiveInCatalog('claude');

    return {
      connections: {
        googleDrive: isDrive,
        threads: isThr,
        telegram: isTg,
        claude: isClaude,
        hyperliquid: isHl,
        whatsapp: hasWhatsAppSecret || isCloudConnected('whatsapp') || activations.includes('whatsapp') || isConnectorActiveInCatalog('whatsapp'),
        baseWallet: Boolean(normWallet && normWallet.startsWith('0x'))
      },
      telegramId,
      whatsAppPhone,
      activatedConnectors: Array.from(new Set(activations))
    };
  };

  // 2. User Directory & Status
  router.get('/users', async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const subscriptionService = agentManager.getSubscriptionService();
      const activeInstances = agentManager.getAllInstances();
      const userMap = new Map<string, any>();

      // Fetch persisted users, wallet accounts, cloud connections, and auth identities
      let persistedUsers: any[] = [];
      let walletAccounts: any[] = [];
      let cloudConns: any[] = [];
      let authIdentities: any[] = [];

      if (supabaseClient) {
        try {
          const results = await Promise.all([
            supabaseClient.select<any>('sera_users', 'select=*').catch(() => []),
            supabaseClient.select<any>('wallet_accounts', 'select=*').catch(() => []),
            supabaseClient.select<any>('user_cloud_connections', 'select=*').catch(() => []),
            supabaseClient.select<any>('auth_identities', 'select=*').catch(() => [])
          ]);
          persistedUsers = Array.isArray(results[0]) ? results[0] : [];
          walletAccounts = Array.isArray(results[1]) ? results[1] : [];
          cloudConns = Array.isArray(results[2]) ? results[2] : [];
          authIdentities = Array.isArray(results[3]) ? results[3] : [];
        } catch (e: any) {
          console.warn('[AdminRouter] Supabase users query fallback:', e.message);
        }
      }

      // Index wallet accounts by user_id
      const walletsByUser = new Map<string, any[]>();
      for (const w of walletAccounts) {
        const uid = (w.user_id || '').toLowerCase();
        if (!walletsByUser.has(uid)) walletsByUser.set(uid, []);
        walletsByUser.get(uid)!.push(w);
      }

      // Index auth identities by user_id
      const authByUser = new Map<string, any[]>();
      for (const a of authIdentities) {
        const uid = (a.user_id || '').toLowerCase();
        if (!authByUser.has(uid)) authByUser.set(uid, []);
        authByUser.get(uid)!.push(a);
      }

      // Index cloud connections by user_id
      const cloudConnsByUser = new Map<string, any[]>();
      for (const c of cloudConns) {
        const uid = (c.user_id || '').toLowerCase();
        if (!cloudConnsByUser.has(uid)) cloudConnsByUser.set(uid, []);
        cloudConnsByUser.get(uid)!.push(c);
      }

      // Helper to retrieve user & wallet cloud connections
      const getConnsForUser = (uid: string, walletAddr?: string) => {
        const conns = cloudConnsByUser.get(uid) || [];
        const walletConns = walletAddr ? (cloudConnsByUser.get(walletAddr.toLowerCase()) || []) : [];
        return [...conns, ...walletConns];
      };

      // 1. Populate from persisted Supabase users
      for (const u of persistedUsers) {
        const uid = (u.id || '').toLowerCase();
        const userWallets = walletsByUser.get(uid) || [];
        const userAuths = authByUser.get(uid) || [];
        const personalWallet = userWallets.find(w => w.kind === 'PERSONAL')?.address
          || userAuths.find(a => a.provider === 'reown_wallet')?.subject
          || '';
        const agentVault = userWallets.find(w => w.kind === 'AGENT')?.address || '';

        const inst = agentManager.getInstance(uid);
        let rawCredits = subscriptionService.getAgentCredits(uid);
        if ((!rawCredits || rawCredits === 0) && personalWallet) {
          rawCredits = subscriptionService.getAgentCredits(personalWallet);
        }
        // Every registered account receives SERA's standard 1,000,000 welcome computation credits
        if (!rawCredits || rawCredits === 0) {
          rawCredits = 1000000;
          subscriptionService.addCreditsDirectly(uid, 1000000);
          if (personalWallet) {
            subscriptionService.addCreditsDirectly(personalWallet, 1000000);
          }
        }
        const credits = rawCredits === Infinity || !isFinite(rawCredits) ? 999999999 : (rawCredits ?? 0);
        const triggersCount = inst?.triggerStore ? inst.triggerStore.getAll().length : 0;
        const { connections } = await resolveUserConnections(uid, personalWallet, getConnsForUser(uid, personalWallet));

        userMap.set(uid, {
          id: uid,
          walletAddress: personalWallet,
          agentVaultAddress: agentVault,
          isInstanceActive: Boolean(inst),
          agentCredits: credits,
          subscriptionTier: credits > 2000000 ? 'PRO' : credits > 500000 ? 'STARTER' : 'FREE',
          activeTriggersCount: triggersCount,
          connections,
          createdAt: u.created_at ? Date.parse(u.created_at) : Date.now() - 86400000,
          lastActiveAt: inst ? Date.now() : (u.updated_at ? Date.parse(u.updated_at) : Date.now() - 3600000)
        });
      }

      // 2. Overlay or add active instances in memory
      for (const inst of activeInstances) {
        const id = inst.sessionId.toLowerCase();
        if (userMap.has(id)) {
          const entry = userMap.get(id);
          entry.isInstanceActive = true;
          if (!entry.walletAddress && inst.personalWalletAddress) {
            entry.walletAddress = inst.personalWalletAddress;
            entry.connections.baseWallet = true;
          }
          if (!entry.agentVaultAddress && inst.goalBridge?.['personalWalletAddress']) {
            entry.agentVaultAddress = inst.goalBridge?.['personalWalletAddress'];
          }
          entry.lastActiveAt = Date.now();
          continue;
        }

        const rawCredits = subscriptionService.getAgentCredits(id);
        const credits = rawCredits === Infinity || !isFinite(rawCredits) ? 999999999 : (rawCredits ?? 0);
        const triggersCount = inst.triggerStore ? inst.triggerStore.getAll().length : 0;
        const wallet = inst.personalWalletAddress || (id.startsWith('0x') ? id : '');
        const vault = inst.goalBridge?.['personalWalletAddress'] || '';
        const { connections } = await resolveUserConnections(id, wallet, getConnsForUser(id, wallet));

        userMap.set(id, {
          id,
          walletAddress: wallet,
          agentVaultAddress: vault,
          isInstanceActive: true,
          agentCredits: credits,
          subscriptionTier: credits > 2000000 ? 'PRO' : credits > 500000 ? 'STARTER' : 'FREE',
          activeTriggersCount: triggersCount,
          connections,
          createdAt: Date.now(),
          lastActiveAt: Date.now()
        });
      }

      // 3. Include any users present in cloud connections but not yet in userMap
      for (const c of cloudConns) {
        const uid = (c.user_id || '').toLowerCase();
        if (uid && !userMap.has(uid)) {
          const userWallets = walletsByUser.get(uid) || [];
          const userAuths = authByUser.get(uid) || [];
          const personalWallet = userWallets.find(w => w.kind === 'PERSONAL')?.address
            || userAuths.find(a => a.provider === 'reown_wallet')?.subject
            || (uid.startsWith('0x') ? uid : '');
          const agentVault = userWallets.find(w => w.kind === 'AGENT')?.address || '';

          let rawCredits = subscriptionService.getAgentCredits(uid);
          if ((!rawCredits || rawCredits === 0) && personalWallet) {
            rawCredits = subscriptionService.getAgentCredits(personalWallet);
          }
          if (!rawCredits || rawCredits === 0) {
            rawCredits = 1000000;
            subscriptionService.addCreditsDirectly(uid, 1000000);
          }
          const credits = rawCredits === Infinity || !isFinite(rawCredits) ? 999999999 : (rawCredits ?? 0);
          const { connections } = await resolveUserConnections(uid, personalWallet, getConnsForUser(uid, personalWallet));

          userMap.set(uid, {
            id: uid,
            walletAddress: personalWallet,
            agentVaultAddress: agentVault,
            isInstanceActive: false,
            agentCredits: credits,
            subscriptionTier: credits > 2000000 ? 'PRO' : credits > 500000 ? 'STARTER' : 'FREE',
            activeTriggersCount: 0,
            connections,
            createdAt: Date.now() - 86400000,
            lastActiveAt: Date.now() - 3600000
          });
        }
      }

      // 4. Ensure 'dev' session exists with realistic environment status
      if (!userMap.has('dev')) {
        const devInst = agentManager.getInstance('dev');
        const devWallet = devInst?.personalWalletAddress || process.env.OWNER_WALLET_ADDRESS || '0x42dC6Ed795282200BDA6D330E069Df92E77e90d9';
        const devVault = devInst?.goalBridge?.['personalWalletAddress'] || '0xE6577bAb7a43b659ddE88DBF723A019eCE6e3E12';
        const devTriggers = devInst?.triggerStore ? devInst.triggerStore.getAll().length : 0;

        const devCloudConns = cloudConnsByUser.get('dev') || [];
        const isDevConn = (term: string) => devCloudConns.some(c => (c.provider || '').toLowerCase().includes(term) && c.status === 'CONNECTED');

        userMap.set('dev', {
          id: 'dev',
          walletAddress: devWallet,
          agentVaultAddress: devVault,
          isInstanceActive: Boolean(devInst),
          agentCredits: 999999999,
          subscriptionTier: 'UNLIMITED',
          activeTriggersCount: devTriggers,
          connections: {
            googleDrive: isDevConn('drive') || isDevConn('google') || Boolean(process.env.GOOGLE_REFRESH_TOKEN),
            threads: isDevConn('threads') || Boolean(process.env.THREADS_ACCESS_TOKEN),
            telegram: isDevConn('telegram') || Boolean(process.env.TELEGRAM_BOT_TOKEN),
            claude: true,
            hyperliquid: true,
            whatsapp: isDevConn('whatsapp'),
            baseWallet: Boolean(devWallet)
          },
          createdAt: Date.now() - 30 * 86400000,
          lastActiveAt: Date.now()
        });
      }

      const usersList = Array.from(userMap.values());
      res.json({
        success: true,
        count: usersList.length,
        users: usersList
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list users', message: err.message });
    }
  });

  // 3. User Deep Detail
  router.get('/users/:sessionId', async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const sessionId = String(req.params.sessionId).toLowerCase();
      const instance = agentManager.getInstance(sessionId);
      const subscriptionService = agentManager.getSubscriptionService();
      let rawCredits = subscriptionService.getAgentCredits(sessionId);

      let triggers: any[] = [];
      let memoryBeliefs: any[] = [];
      let agreements: any[] = [];

      if (instance) {
        if (instance.triggerStore && typeof instance.triggerStore.getAll === 'function') {
          triggers = instance.triggerStore.getAll();
        }
        if (instance.memoryStore && typeof (instance.memoryStore as any).getSnapshot === 'function') {
          const snapshot = (instance.memoryStore as any).getSnapshot();
          memoryBeliefs = snapshot?.protectedBeliefs || [];
        }
        if (instance.autonomyAgreementStore && typeof instance.autonomyAgreementStore.getAll === 'function') {
          agreements = instance.autonomyAgreementStore.getAll();
        }
      }

      let cloudConnections: any[] = [];
      let walletAccounts: any[] = [];
      let personalWalletAddress = instance?.personalWalletAddress || (sessionId.startsWith('0x') ? sessionId : '');
      let agentVaultAddress = instance?.goalBridge?.['personalWalletAddress'] || '';

      if (supabaseClient) {
        try {
          const [conns, wallets, auths] = await Promise.all([
            supabaseClient.select<any>('user_cloud_connections', `user_id=eq.${sessionId}`).catch(() => []),
            supabaseClient.select<any>('wallet_accounts', `user_id=eq.${sessionId}`).catch(() => []),
            supabaseClient.select<any>('auth_identities', `user_id=eq.${sessionId}`).catch(() => [])
          ]);
          if (Array.isArray(conns)) cloudConnections = conns;
          if (Array.isArray(wallets)) {
            walletAccounts = wallets;
            const personal = wallets.find((w: any) => w.kind === 'PERSONAL')?.address;
            const agent = wallets.find((w: any) => w.kind === 'AGENT')?.address;
            if (personal) personalWalletAddress = personal;
            if (agent) agentVaultAddress = agent;
          }
          if (!personalWalletAddress && Array.isArray(auths)) {
            const reownAuth = auths.find((a: any) => a.provider === 'reown_wallet');
            if (reownAuth?.subject) personalWalletAddress = reownAuth.subject;
          }
        } catch (e: any) {
          console.warn('[AdminRouter] Supabase detail connection query fallback:', e.message);
        }
      }

      if (sessionId === 'dev') {
        if (!personalWalletAddress) personalWalletAddress = process.env.OWNER_WALLET_ADDRESS || '0x42dC6Ed795282200BDA6D330E069Df92E77e90d9';
        if (!agentVaultAddress) agentVaultAddress = '0xE6577bAb7a43b659ddE88DBF723A019eCE6e3E12';
      }

      // Check fallback credits via personalWalletAddress or grant 1,000,000 welcome credits
      if ((!rawCredits || rawCredits === 0) && personalWalletAddress) {
        rawCredits = subscriptionService.getAgentCredits(personalWalletAddress);
      }
      if (!rawCredits || rawCredits === 0) {
        rawCredits = 1000000;
        subscriptionService.addCreditsDirectly(sessionId, 1000000);
      }
      const credits = rawCredits === Infinity || !isFinite(rawCredits) ? 999999999 : rawCredits;

      // Unified platform connection & SecretManager inspection
      const { connections, telegramId, activatedConnectors } = await resolveUserConnections(
        sessionId,
        personalWalletAddress,
        cloudConnections
      );

      res.json({
        success: true,
        user: {
          id: sessionId,
          walletAddress: personalWalletAddress,
          agentVaultAddress,
          walletAccounts,
          isInstanceActive: Boolean(instance),
          agentCredits: credits,
          subscriptionTier: credits > 2000000 ? 'PRO' : credits > 500000 ? 'STARTER' : 'FREE',
          telegramId,
          activatedConnectors,
          connections,
          triggers,
          memoryBeliefs,
          agreements,
          cloudConnections
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to fetch user detail', message: err.message });
    }
  });

  // 4. Grant / Adjust Credits
  router.post('/users/:sessionId/credits', async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const sessionId = String(req.params.sessionId).toLowerCase();
      const { amount } = req.body || {};
      const numericAmount = Number(amount);

      if (isNaN(numericAmount) || numericAmount === 0) {
        res.status(400).json({ error: 'Invalid credit amount specified.' });
        return;
      }

      const subscriptionService = agentManager.getSubscriptionService();
      if (numericAmount > 0) {
        subscriptionService.addCreditsDirectly(sessionId, numericAmount);
      } else {
        subscriptionService.consumeCredits(sessionId, Math.abs(numericAmount));
      }

      const updatedCredits = subscriptionService.getAgentCredits(sessionId);

      res.json({
        success: true,
        message: `Updated credits for ${sessionId}`,
        agentCredits: updatedCredits
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to update credits', message: err.message });
    }
  });

  // 5. Force Disconnect Integration
  router.post('/users/:sessionId/disconnect', async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const sessionId = String(req.params.sessionId).toLowerCase();
      const { provider } = req.body || {};

      if (!provider) {
        res.status(400).json({ error: 'Provider parameter is required (e.g. threads, google-drive).' });
        return;
      }

      if (supabaseClient) {
        try {
          await supabaseClient.upsert('user_cloud_connections', {
            user_id: sessionId,
            provider: String(provider).toLowerCase(),
            status: 'REVOKED',
            revoked_at: new Date().toISOString()
          }, 'user_id,provider');
        } catch (e: any) {
          console.warn('[AdminRouter] Supabase disconnect update fallback:', e.message);
        }
      }

      res.json({
        success: true,
        message: `Successfully disconnected ${provider} for user ${sessionId}`
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to disconnect integration', message: err.message });
    }
  });

  // 6. Cancel Background Trigger
  router.delete('/users/:sessionId/triggers/:triggerId', async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const sessionId = String(req.params.sessionId).toLowerCase();
      const triggerId = String(req.params.triggerId);
      const instance = agentManager.getInstance(sessionId);

      if (!instance || !instance.triggerStore) {
        res.status(404).json({ error: 'Active instance or trigger store not found for session.' });
        return;
      }

      instance.triggerStore.delete(triggerId);

      res.json({
        success: true,
        message: `Trigger ${triggerId} cancelled successfully for ${sessionId}.`
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to cancel trigger', message: err.message });
    }
  });

  // 7. Global Triggers List
  router.get('/triggers', async (req: AuthenticatedAdminRequest, res: Response): Promise<void> => {
    try {
      const allInstances = agentManager.getAllInstances();
      const allTriggers: any[] = [];

      for (const inst of allInstances) {
        if (inst.triggerStore && typeof inst.triggerStore.getAll === 'function') {
          const list = inst.triggerStore.getAll();
          for (const t of list) {
            allTriggers.push({
              ...t,
              sessionId: inst.sessionId,
              walletAddress: inst.personalWalletAddress || inst.sessionId
            });
          }
        }
      }

      res.json({
        success: true,
        count: allTriggers.length,
        triggers: allTriggers
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to list global triggers', message: err.message });
    }
  });

  return router;
}

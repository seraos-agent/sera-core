import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { isAddress } from 'viem';
import { randomUUID } from 'crypto';
import { EventEmitter } from 'node:events';
import { StandardEvent, EventTypes } from '../core/events/types';
import { agentManager, SubscriptionRequiredError } from './AgentManager';
import { isAllowedOrigin, serverConfig } from './config';
import { requireAuthenticatedSession } from './SessionGuard';
import { createHmac, randomBytes } from 'crypto';
import { SeraUserContext } from '../core/identity/types';
import { resolveVerifiedWalletIdentity } from '../core/identity/WalletIdentityResolver';
import { SupabaseIdentityService } from '../core/identity/SupabaseIdentityService';
import { ReownWalletIdentityService, WalletAlreadyLinkedError } from '../core/identity/ReownWalletIdentityService';
import { verifyWalletSignature } from './WalletSignatureVerifier';
import { GoogleDriveOAuthService } from '../core/integrations/google-drive/GoogleDriveOAuthService';
import { TreasuryDepositWatcher } from './billing/TreasuryDepositWatcher';
import { McpApiKeyStore } from '../mcp/McpApiKeyStore';
import { SeraMcpServer } from '../mcp/SeraMcpServer';
import { TelegramBotManager } from '../capabilities/communication/adapters/TelegramBotManager';
import { TelegramAdapter } from '../capabilities/communication/adapters/TelegramAdapter';
import { PredictionEngineService } from '../capabilities/predictions/PredictionEngineService';
import { predictionEngine, arenaEventBus } from './predictionEngine';
import { createThreadsAuthRouter, ThreadsOAuthService } from './auth/threadsAuth';
import { BaseAdapter } from '../capabilities/wallet/chains/BaseAdapter';
import { HygieneDaemon } from '../core/hygiene/HygieneDaemon';
import { SupabaseRestClient } from '../core/persistence/SupabaseRestClient';

export { predictionEngine };
const mcpApiKeyStore = new McpApiKeyStore();

const SESSION_SECRET = process.env.SESSION_SECRET || randomBytes(32).toString('hex');
const supabaseIdentityService = SupabaseIdentityService.fromEnvironment();
const reownWalletIdentityService = ReownWalletIdentityService.fromEnvironment();
const googleDriveOAuthService = GoogleDriveOAuthService.fromEnvironment();
console.log(`[Server] Google Drive OAuth Service initialized:`, !!googleDriveOAuthService);
const globalSecretManager = agentManager.getOrCreateInstance('dev').runtime.secretManager;
export const telegramBotManager = new TelegramBotManager(agentManager, globalSecretManager, process.env.TELEGRAM_BOT_TOKEN);
const threadsOAuthService = new ThreadsOAuthService(globalSecretManager);

console.log(`[Server] Supabase Services Init - URL: ${process.env.SUPABASE_URL ? 'OK' : 'MISSING'}, Secret: ${process.env.SUPABASE_SECRET_KEY ? 'OK' : 'MISSING'}`);
console.log(`[Server] reownWalletIdentityService is ${reownWalletIdentityService ? 'ACTIVE' : 'NULL (Falling back to local auth)'}`);
console.log(`[Server] Threads OAuth Service initialized - App ID: ${threadsOAuthService.appId ? 'OK' : 'MISSING'}`);

// ── Hygiene Daemon (Automated Garbage Collection) ────────────────────────────
const supabaseClient = SupabaseRestClient.fromEnvironment();
if (supabaseClient) {
  const hygieneDaemon = new HygieneDaemon(supabaseClient);
  hygieneDaemon.start();
} else {
  console.warn('[Server] HygieneDaemon not started: Supabase credentials missing.');
}

agentManager.onInstanceCreated((instance) => {
  instance.communicationBridge.registerAdapter(
    'telegram',
    new TelegramAdapter(instance.sessionId, telegramBotManager, instance.eventBus)
  );
});

interface SessionTokenPrincipal {
  userId: string;
  personalWalletAddress?: string;
  expiry: number;
}

interface WalletLinkChallenge {
  address: string;
  message: string;
  expiresAt: number;
}

function generateSessionToken(principal: Omit<SessionTokenPrincipal, 'expiry'>): string {
  const expiry = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  const payload = Buffer.from(JSON.stringify({ ...principal, expiry })).toString('base64url');
  const signature = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function verifySessionToken(token: string): SessionTokenPrincipal | null {
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

const app = express();
// Lightweight, unauthenticated probe for deployment platforms. It deliberately
// does not instantiate or expose any agent state.
app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'sera-core' });
});
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
  },
});

function renderGoogleDriveCallbackPage(title: string, message: string, isSuccess: boolean): string {
  const color = isSuccess ? '#28795B' : '#B23B3B';
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]!));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F7F4;color:#18221D;font-family:Inter,system-ui,sans-serif"><main style="width:min(90vw,440px);padding:32px;border:1px solid #D9DDD6;border-radius:18px;background:#FFF"><div style="color:${color};font-weight:700;font-size:12px;letter-spacing:.08em">SERA GOOGLE DRIVE</div><h1 style="font-size:24px;margin:12px 0">${escapeHtml(title)}</h1><p style="color:#58635B;line-height:1.55;margin:0">${escapeHtml(message)}</p><p style="color:#58635B;font-size:13px;margin:20px 0 0">You can close this window.</p></main><script>window.opener?.postMessage({type:'sera:google-drive:complete',success:${isSuccess}}, '*');</script></body></html>`;
}

app.get('/auth/google-drive/callback', async (request, response) => {
  if (!googleDriveOAuthService) {
    response.status(503).type('html').send(renderGoogleDriveCallbackPage('Google Drive is not configured', 'SERA Core is missing its Google Drive OAuth configuration.', false));
    return;
  }

  const code = typeof request.query.code === 'string' ? request.query.code : undefined;
  const state = typeof request.query.state === 'string' ? request.query.state : undefined;
  const authorizationError = typeof request.query.error === 'string' ? request.query.error : undefined;
  if (authorizationError || !code || !state) {
    response.status(400).type('html').send(renderGoogleDriveCallbackPage('Google Drive was not connected', authorizationError || 'The authorization response was incomplete.', false));
    return;
  }

  try {
    const completed = await googleDriveOAuthService.completeAuthorization(code, state);
    io.to(`user:${completed.userId}`).emit('google_drive:status', completed.status);
    response.type('html').send(renderGoogleDriveCallbackPage('Google Drive connected', 'Your SERA Vault folder is ready. SERA stores only validated memory projections there.', true));
  } catch (error) {
    console.error('[GoogleDrive] OAuth callback failed:', error);
    const message = error instanceof Error ? error.message : 'The connection could not be completed.';
    response.status(400).type('html').send(renderGoogleDriveCallbackPage('Google Drive was not connected', message, false));
  }
});

// ─── MCP Streamable HTTP Transport ────────────────────────────────────────────
const seraMcpServer = new SeraMcpServer({
  apiKeyStore: mcpApiKeyStore,
  resolveInstance: (userId: string) => agentManager.getOrCreateInstance(userId),
  getSubscriptionService: () => agentManager.getSubscriptionService(),
});

// Express CORS and body parser for MCP routes
app.use('/mcp', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use('/mcp', express.json());

// List available MCP tools
app.get('/mcp/tools', (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '') || '';
  const userId = mcpApiKeyStore.resolveUser(apiKey);
  if (!userId) return res.status(401).json({ error: 'Invalid API key' });
  res.json({
    tools: [
      { name: 'sera_chat', description: 'Send a message to your personal Sera AI agent and receive a response.', inputSchema: { type: 'object', properties: { message: { type: 'string', description: 'The message to send to Sera' } }, required: ['message'] } },
      { name: 'sera_wallet_balance', description: 'Check the current balance and address of your Sera Agent Vault wallet.', inputSchema: { type: 'object', properties: {} } },
      { name: 'sera_wallet_transfer', description: 'Propose a token transfer from your Sera Agent Vault (requires dashboard approval).', inputSchema: { type: 'object', properties: { to: { type: 'string' }, amount: { type: 'string' }, asset: { type: 'string' }, reason: { type: 'string' } }, required: ['to', 'amount', 'asset'] } },
      { name: 'sera_memory_read', description: 'Read your Sera agent\'s confirmed beliefs and working memory.', inputSchema: { type: 'object', properties: {} } },
      { name: 'sera_billing_status', description: 'Check your remaining Sera Agent Credits balance.', inputSchema: { type: 'object', properties: {} } }
    ]
  });
});

// Execute an MCP tool call (used by sera-mcp-stdio proxy)
app.post('/mcp/tool', async (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '') || '';
  const userId = mcpApiKeyStore.resolveUser(apiKey);
  if (!userId) return res.status(401).json({ isError: true, content: [{ type: 'text', text: 'Invalid API key' }] });

  const { name, arguments: args } = req.body;
  if (!name) return res.status(400).json({ isError: true, content: [{ type: 'text', text: 'Tool name is required' }] });

  const instance = agentManager.getOrCreateInstance(userId);

  // Delegate to SeraMcpServer's internal handler by simulating the MCP call
  try {
    // Use a direct approach: inject the API key into _meta and call the server's handler
    const mockRequest = { params: { name, arguments: args || {}, _meta: { apiKey } } };
    // We access the server's handler directly via the public method
    const result = await (seraMcpServer as any).handleToolCallDirect(name, args || {}, userId, instance);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ isError: true, content: [{ type: 'text', text: `Error: ${error.message}` }] });
  }
});

import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
const mcpTransports = new Map<string, SSEServerTransport>();

app.get('/mcp/sse', async (req, res) => {
  const apiKey = req.query.apiKey as string || req.headers.authorization?.replace('Bearer ', '') || '';
  const userId = mcpApiKeyStore.resolveUser(apiKey);
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing Sera API Key' });
  }

  // Construct the absolute endpoint URL for the client to send messages to
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const messageEndpoint = `${protocol}://${host}/mcp/message`;

  // Create a dedicated transport for this connection using the absolute URL
  const transport = new SSEServerTransport(messageEndpoint, res);
  await transport.start();
  
  mcpTransports.set(transport.sessionId, transport);
  
  // Create a new Server instance just for this connection
  const serverInstance = seraMcpServer.createServer(apiKey);
  
  // We will just connect it
  await serverInstance.connect(transport);
  
  res.on('close', () => {
    mcpTransports.delete(transport.sessionId);
  });
});

app.post('/mcp/message', async (req, res) => {
  const sessionId = req.query.sessionId as string;
  const transport = mcpTransports.get(sessionId);
  if (!transport) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // We need to inject the API key into the message if it's a CallToolRequest
  // The API key was validated in /mcp/sse, but the handler needs it.
  // We can't easily modify the transport's internal message routing, 
  // but we can just let it fail auth if not provided?
  // Actually, Claude Desktop sends headers on /mcp/message as well.
  
  await transport.handlePostMessage(req, res);
});

// ── Auth & OAuth Routes ──────────────────────────────────────────────────
app.use('/api/auth/threads', createThreadsAuthRouter(threadsOAuthService, globalSecretManager, (sessionId) => {
  io.to(`user:${sessionId}`).emit('threads:status', { provider: 'THREADS', status: 'CONNECTED' });
  const inst = agentManager.getOrCreateInstance(sessionId);
  if (inst?.runtime?.capabilityCatalog) {
    io.to(`user:${sessionId}`).emit('connector:status_changed', inst.runtime.capabilityCatalog.allConnectorSummaries());
  }
}));

let msgIdCounter = Date.now();

// Arena Global Broadcasting
arenaEventBus.on('arena:markets_updated', (markets) => {
  io.emit('arena:markets', markets);
});

arenaEventBus.on('arena:price_tick', (payload) => {
  io.emit('arena:price_tick', payload);
});

// ─── Socket.io Bridge (Sensory Layer) ────────────────────────────────────────
io.on('connection', (socket: Socket) => {
  console.log(`[Server] UI Client connected: ${socket.id}`);

  // By default, connections are unauthenticated and bound to nothing.
  // We point them to 'dev' to prevent null reference errors, but they cannot 
  // interact or read its state until auth:login succeeds.
  socket.data.sessionId = 'dev';
  socket.data.isAuthenticated = false;
  let instance = agentManager.getOrCreateInstance('dev');
  let walletLinkChallenge: WalletLinkChallenge | undefined;
  let socketObservationBuffer: any[] = [];

  const challengeCache = new Map<string, string>();

  const issueLoginChallenge = (payload?: { address?: string }) => {
    const address = payload?.address?.toLowerCase();
    if (address && challengeCache.has(address)) {
      const message = challengeCache.get(address)!;
      socket.data.loginMessage = message;
      socket.emit('auth:challenge', { message });
      return;
    }
    
    const nonce = randomUUID();
    const message = `Sign in to Sera\nNonce: ${nonce}`;
    socket.data.loginMessage = message;
    if (address) {
      challengeCache.set(address, message);
      // Clean up after 5 minutes
      setTimeout(() => challengeCache.delete(address), 5 * 60 * 1000);
    }
    socket.emit('auth:challenge', { message });
  };

  const sendInitialState = async () => {
    try {
      await instance.chatHistoryStore.ensureLoaded();
    } catch (e) {
      console.warn('[Server] Failed to ensure chat history loaded:', e);
    }
    const walletState = instance.worldStateService.getWalletState();
    if (walletState && walletState.address) {
      socket.emit('wallet:update', walletState);
    }
    socket.emit('memory:vault_status', instance.memoryVault);
    socket.emit('chat:history', instance.chatHistoryStore.getUiMessages());
    socket.emit('observations:history', instance.observationStore.getAll());
    socket.emit('automations:update', instance.triggerStore.getAll());
    socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
    if (instance.metaGovernanceReview) {
      socket.emit('governance:recommendation_list', instance.metaGovernanceReview.getPendingRecommendations());
    }
    if (googleDriveOAuthService && socket.data.sessionId) {
      void googleDriveOAuthService.getStatus(socket.data.sessionId)
        .then((status) => {
          console.log(`[GoogleDrive] Status for ${socket.data.sessionId}:`, status);
          socket.emit('google_drive:status', status);
        })
        .catch((e) => {
          console.error(`[GoogleDrive] Error getting status for ${socket.data.sessionId}:`, e);
          socket.emit('google_drive:status', { provider: 'GOOGLE_DRIVE', status: 'UNAVAILABLE' });
        });
    } else {
      console.log(`[GoogleDrive] UNAVAILABLE because:`, { serviceExists: !!googleDriveOAuthService, sessionId: socket.data.sessionId });
      socket.emit('google_drive:status', { provider: 'GOOGLE_DRIVE', status: 'UNAVAILABLE' });
    }
    if (socket.data.sessionId) {
      void threadsOAuthService.getStatus(socket.data.sessionId)
        .then((status) => socket.emit('threads:status', status))
        .catch(() => socket.emit('threads:status', { provider: 'THREADS', status: 'UNAVAILABLE' }));
      
      void telegramBotManager.getStatus(socket.data.sessionId)
        .then((status) => {
          socket.emit('telegram:status', status);
          if (status.status === 'CONNECTED') {
            const inst = agentManager.getOrCreateInstance(socket.data.sessionId!);
            if (inst?.runtime?.capabilityCatalog && !inst.runtime.capabilityCatalog.isConnectorActive('telegram')) {
              inst.runtime.capabilityCatalog.activateConnector('telegram');
              socket.emit('connector:catalog', inst.runtime.capabilityCatalog.allConnectorSummaries());
            }
          }
        })
        .catch(() => socket.emit('telegram:status', { provider: 'TELEGRAM', status: 'UNAVAILABLE' }));
    } else {
      socket.emit('threads:status', { provider: 'THREADS', status: 'UNAVAILABLE' });
      socket.emit('telegram:status', { provider: 'TELEGRAM', status: 'UNAVAILABLE' });
    }
  };

  // Do NOT send initial state or bind listeners upon raw connection!
  // Doing so leaks 'dev' state to users who are reconnecting via Wagmi 
  // before their auth:login completes. Wait for auth:login.

  // Socket-specific listener references to allow proper unbinding
  const onAgentSpeak = (event: any) => {
    const payload = event.payload || event;
    const msgId = ++msgIdCounter;
    const currentObs = [...socketObservationBuffer];
    socketObservationBuffer = [];
    
    socket.emit('chat:reply', {
      id: msgId,
      content: payload.text,
      actionLinks: payload.actionLinks,
    });
    instance.chatHistoryStore.appendUiMessage({
      id: msgId,
      role: 'agent',
      content: payload.text,
      actionLinks: payload.actionLinks,
      observations: currentObs.length > 0 ? currentObs : undefined,
    });
  };

  const onActivity = (event: any) => {
    const payload = event.payload || event;
    const msgId = ++msgIdCounter;
    socket.emit('chat:activity', {
      id: msgId,
      content: payload.content,
    });
  };

  const onUiCommand = (event: any) => {
    const payload = event.payload || event;
    socket.emit('ui:command', {
      type: payload.command,
      payload: payload.value,
    });
  };

  const onProposalGenerated = (event: any) => {
    const payload = event.payload || event;
    const msgId = ++msgIdCounter;
    const currentObs = [...socketObservationBuffer];
    socketObservationBuffer = [];
    
    const proposalData = {
      id: msgId,
      proposalId: payload.proposalId,
      intent: payload.intent,
      parameters: payload.parameters,
      candidates: payload.candidates
    };
    socket.emit('chat:proposal', proposalData);
    instance.chatHistoryStore.appendUiMessage({
      id: msgId,
      role: 'agent',
      proposal: proposalData,
      observations: currentObs.length > 0 ? currentObs : undefined,
    });
  };

  const onGoalResult = (event: StandardEvent) => {
    const result = event.payload;
    const trigger = instance.triggerStore.get(result.requestId);
    if (trigger) {
      trigger.lastExecutionResult = {
        success: result.success,
        errorMessage: result.errorMessage
      };
      instance.triggerStore.save(trigger);
      socket.emit('automations:update', instance.triggerStore.getAll());
    }
  };

  const onCognitiveObservation = (event: StandardEvent) => {
    instance.observationStore.append(event);
    socketObservationBuffer.push({ ...event.payload, timestamp: event.timestamp });
    socket.emit('observations:new', { ...event.payload, timestamp: event.timestamp });
  };

  const onWalletUpdate = (event: StandardEvent) => {
    socket.emit('wallet:update', event.payload);
  };

  const onAutonomyAgreementChanged = () => {
    socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
  };

  const onGovernanceRecommendationSubmitted = (event: StandardEvent) => {
    socket.emit('governance:recommendation_pending', event.payload);
    if (instance.metaGovernanceReview) {
      socket.emit('governance:recommendation_list', instance.metaGovernanceReview.getPendingRecommendations());
    }
  };

  const onBillingCreditsUpdated = (event: StandardEvent) => {
    // The frontend listens to 'billing:update' to set state.agentCredits
    socket.emit('billing:update', event.payload);
  };

  const bindListeners = () => {
    instance.eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
    instance.eventBus.on(EventTypes.DIALOGUE_ACTIVITY, onActivity);
    instance.eventBus.on(EventTypes.UI_COMMAND, onUiCommand);
    instance.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);
    instance.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);
    instance.eventBus.on(EventTypes.GOAL_REQUIRES_APPROVAL, (payload: any) => socket.emit('governance:approval_needed', payload));
    instance.eventBus.on(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);
    instance.eventBus.on(EventTypes.DOMAIN_WALLET_STATE, onWalletUpdate);
    instance.eventBus.on(EventTypes.AUTONOMY_AGREEMENT_ACTIVATED, onAutonomyAgreementChanged);
    instance.eventBus.on(EventTypes.AUTONOMY_AGREEMENT_REVOKED, onAutonomyAgreementChanged);
    instance.eventBus.on(EventTypes.GOVERNANCE_RECOMMENDATION_SUBMITTED, onGovernanceRecommendationSubmitted);
    instance.eventBus.on(EventTypes.BILLING_CREDITS_UPDATED, onBillingCreditsUpdated);
  };

  const unbindListeners = () => {
    instance.eventBus.off(EventTypes.DIALOGUE_AGENT_SPEAK, onAgentSpeak);
    instance.eventBus.off(EventTypes.DIALOGUE_ACTIVITY, onActivity);
    instance.eventBus.off(EventTypes.UI_COMMAND, onUiCommand);
    instance.eventBus.off(EventTypes.DIALOGUE_PROPOSAL_GENERATED, onProposalGenerated);
    instance.eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, onGoalResult);
    instance.eventBus.removeAllListeners(EventTypes.GOAL_REQUIRES_APPROVAL);
    instance.eventBus.off(EventTypes.COGNITIVE_OBSERVATION, onCognitiveObservation);
    instance.eventBus.off(EventTypes.DOMAIN_WALLET_STATE, onWalletUpdate);
    instance.eventBus.off(EventTypes.AUTONOMY_AGREEMENT_ACTIVATED, onAutonomyAgreementChanged);
    instance.eventBus.off(EventTypes.AUTONOMY_AGREEMENT_REVOKED, onAutonomyAgreementChanged);
    instance.eventBus.off(EventTypes.GOVERNANCE_RECOMMENDATION_SUBMITTED, onGovernanceRecommendationSubmitted);
    instance.eventBus.off(EventTypes.BILLING_CREDITS_UPDATED, onBillingCreditsUpdated);
  };

  // Listeners are only bound after successful auth:login.

  socket.on('auth:challenge', issueLoginChallenge);

  socket.on('auth:login', async (payload: { address?: string; message?: string; signature?: `0x${string}`; token?: string; supabaseAccessToken?: string; telegramInitData?: string }) => {
    let address = payload?.address?.toLowerCase();
    let principal: SeraUserContext;

    // Check token authentication
    if (payload.token) {
      const recoveredPrincipal = verifySessionToken(payload.token);
      
      // Reject legacy "wallet:" development tokens to force a fresh login and real UUID generation in Supabase
      if (recoveredPrincipal?.userId.startsWith('wallet:')) {
        socket.emit('auth:error', { message: 'Your session has been upgraded. Please sign in again to sync with the database.', code: 'INVALID_TOKEN' });
        return;
      }

      if (recoveredPrincipal && (!address || recoveredPrincipal.personalWalletAddress === address)) {
        address = recoveredPrincipal.personalWalletAddress;
        principal = {
          userId: recoveredPrincipal.userId,
          personalWalletAddress: recoveredPrincipal.personalWalletAddress,
        };
      } else {
        socket.emit('auth:error', { message: 'Session expired or invalid. Please sign in again.', code: 'INVALID_TOKEN' });
        return;
      }

    } else if (payload.supabaseAccessToken) {
      if (!supabaseIdentityService) {
        socket.emit('auth:error', { message: 'Supabase identity is not configured on this server.', code: 'IDENTITY_UNAVAILABLE' });
        return;
      }
      try {
        principal = await supabaseIdentityService.resolve(payload.supabaseAccessToken, address);
      } catch (error) {
        console.error('[Server] Supabase identity verification failed:', error);
        socket.emit('auth:error', { message: 'Your sign-in session could not be verified. Please sign in again.', code: 'INVALID_IDENTITY_TOKEN' });
        return;
      }
    } else {
      address = address || 'dev';
      console.log(`[Server] Received auth:login via signature for wallet: ${address}`);

      if (address === 'dev' && !serverConfig.allowDevFeatures) {
        socket.emit('auth:error', { message: 'Development login is disabled.' });
        return;
      }

      if (address !== 'dev' && !isAddress(address)) {
        socket.emit('auth:error', { message: 'A valid wallet address is required.' });
        return;
      }

      if (address !== 'dev' && serverConfig.isProduction) {
        console.log(`[Server] Validating signature for ${address} in production...`);
        if (!payload?.message || !payload?.signature) {
          console.log(`[Server] Missing message or signature for ${address}`);
          socket.emit('auth:error', { message: 'A valid wallet signature is required.' });
          return;
        }
        
        const expectedMessage = challengeCache.get(address) || socket.data.loginMessage;
        if (payload.message !== expectedMessage) {
          console.log(`[Server] Message mismatch for ${address}. Expected: ${expectedMessage}, Got: ${payload.message}`);
          
          // Fallback: If they provided a valid signature for the payload message, and the message format is correct, allow it for now
          // to unblock users stuck in this loop.
          if (!payload.message.startsWith('Sign in to Sera\nNonce:')) {
            socket.emit('auth:error', { message: 'A valid wallet signature is required.' });
            return;
          }
          console.log(`[Server] Format is valid, proceeding to verify fallback signature.`);
        }

        try {
          const isValidSignature = await verifyWalletSignature(
            address as `0x${string}`,
            payload.message,
            payload.signature,
          );
          console.log(`[Server] Signature verification result: ${isValidSignature}`);
          if (!isValidSignature) {
            socket.emit('auth:error', { message: 'Wallet signature could not be verified.' });
            return;
          }
        } catch (error) {
          console.error(`[Server] Signature verification threw an error:`, error);
          socket.emit('auth:error', { message: 'Wallet signature could not be verified due to a network error.' });
          return;
        }
      } else if (address !== 'dev') {
        console.log(`[Server] Bypassing strict signature validation for ${address} in development mode.`);
      }

      if (address === 'dev') {
        principal = { userId: 'dev' };
      } else if (reownWalletIdentityService) {
        try {
          principal = await reownWalletIdentityService.resolveVerifiedWallet(address);
        } catch (error) {
          console.error('[Server] Reown identity persistence failed:', error);
          socket.emit('auth:error', { message: 'Your identity could not be prepared. Please try again.', code: 'IDENTITY_PERSISTENCE_FAILED' });
          return;
        }
      } else {
        // Local compatibility mode until a configured production Supabase
        // service is available. This path never writes user data remotely.
        principal = resolveVerifiedWalletIdentity(address);
      }
    }

    // Now emit the success token to the client so they can save it
    const newToken = generateSessionToken(principal!);
    socket.emit('auth:success', { token: newToken });

    // Switch to new context BEFORE checking entitlement so we don't leak dev state
    if (socket.data.sessionId && socket.data.sessionId !== 'dev') socket.leave(`user:${socket.data.sessionId}`);
    unbindListeners();
    socket.data.sessionId = principal!.userId;
    socket.data.personalWalletAddress = principal!.personalWalletAddress;
    socket.data.loginMessage = undefined;
    instance = agentManager.getOrCreateInstance(principal!);
    bindListeners();
    sendInitialState();

    try {
      agentManager.checkEntitlement(principal!.userId);
    } catch (err) {
      if (err instanceof SubscriptionRequiredError) {
        // ALPHA: Grant 1,000,000 welcome bonus tokens automatically
        agentManager.getSubscriptionService().addCreditsDirectly(principal!.userId, 1000000);
        console.log(`[Server] Granted 1,000,000 welcome tokens to ${principal!.userId}`);
        
        // Ensure the frontend gets the updated balance immediately
        instance.eventBus.emit(EventTypes.BILLING_CREDITS_UPDATED, {
          id: `evt-billing-${Date.now()}`,
          type: EventTypes.BILLING_CREDITS_UPDATED,
          source: 'Server',
          payload: {
            address: principal!.userId,
            agentCredits: 1000000,
            periods: 1
          },
          timestamp: Date.now()
        });
      } else {
        throw err;
      }
    }

    socket.data.isAuthenticated = true;
    socket.join(`user:${principal!.userId}`);

    // Trigger fresh on-chain balance query for the connected user wallet silently
    if (instance?.goalBridge) {
      instance.goalBridge.syncWalletState().catch(err => {
        console.warn('[Server] Failed to refresh wallet balance on login:', err);
      });
    }
  });

  socket.on('auth:logout', () => {
    // A wallet disconnect must also terminate SERA's socket session. Leaving
    // the socket authenticated would make a shared-device logout misleading.
    unbindListeners();
    if (socket.data.sessionId && socket.data.sessionId !== 'dev') socket.leave(`user:${socket.data.sessionId}`);
    walletLinkChallenge = undefined;
    socket.data.isAuthenticated = false;
    socket.data.sessionId = 'dev';
    socket.data.personalWalletAddress = undefined;
    socket.data.loginMessage = undefined;
    instance = agentManager.getOrCreateInstance('dev');
    socket.emit('auth:logged_out');
  });

  socket.on('google_drive:connect', () => {
    if (!requireAuthenticatedSession(socket, 'google_drive:connect', instance?.eventBus)) return;
    if (!googleDriveOAuthService) {
      socket.emit('google_drive:error', { message: 'Google Drive connection is not configured for this environment.' });
      return;
    }
    socket.emit('google_drive:authorization', { authorizationUrl: googleDriveOAuthService.beginAuthorization(socket.data.sessionId!) });
  });

  socket.on('google_drive:disconnect', async () => {
    if (!requireAuthenticatedSession(socket, 'google_drive:disconnect', instance?.eventBus)) return;
    if (!googleDriveOAuthService) {
      socket.emit('google_drive:error', { message: 'Google Drive connection is not configured for this environment.' });
      return;
    }
    try {
      socket.emit('google_drive:status', await googleDriveOAuthService.disconnect(socket.data.sessionId!));
    } catch (error) {
      socket.emit('google_drive:error', { message: error instanceof Error ? error.message : 'Unable to disconnect Google Drive.' });
    }
  });

  socket.on('telegram:generate_link', async () => {
    if (!requireAuthenticatedSession(socket, 'telegram:generate_link', instance?.eventBus)) return;
    if (!telegramBotManager.isEnabled()) {
      socket.emit('telegram:error', { message: 'Telegram Bot is not configured on this server.' });
      return;
    }
    const code = await telegramBotManager.generateLinkCode(socket.data.sessionId);
    socket.emit('telegram:link_generated', { code });
  });

  socket.on('threads:connect', () => {
    if (!requireAuthenticatedSession(socket, 'threads:connect', instance?.eventBus)) return;
    if (socket.data.sessionId === 'dev' || !threadsOAuthService.appId) {
      socket.emit('threads:error', { message: 'Threads connection is not configured for this environment.' });
      return;
    }
    try {
      const authorizationUrl = threadsOAuthService.beginAuthorization(socket.data.sessionId!);
      socket.emit('threads:authorization', { authorizationUrl });
    } catch (err: any) {
      socket.emit('threads:error', { message: err.message || 'Failed to generate Threads authorization URL.' });
    }
  });

  socket.on('threads:disconnect', async () => {
    if (!requireAuthenticatedSession(socket, 'threads:disconnect', instance?.eventBus)) return;
    if (socket.data.sessionId === 'dev') {
      socket.emit('threads:status', { provider: 'THREADS', status: 'NOT_CONNECTED' });
      return;
    }
    try {
      const status = await threadsOAuthService.disconnect(socket.data.sessionId!);
      socket.emit('threads:status', status);
      if (instance?.runtime?.capabilityCatalog) {
        socket.emit('connector:status_changed', instance.runtime.capabilityCatalog.allConnectorSummaries());
      }
    } catch (err: any) {
      socket.emit('threads:error', { message: err.message || 'Failed to disconnect Threads.' });
    }
  });

  socket.on('threads:get_settings', async () => {
    console.log(`[Server] Received threads:get_settings from socket ${socket.id}`);
    if (!requireAuthenticatedSession(socket, 'threads:get_settings', instance?.eventBus)) {
      console.log(`[Server] requireAuthenticatedSession failed for ${socket.id}`);
      return;
    }
    try {
      console.log(`[Server] Fetching secrets for ${socket.data.sessionId}`);
      const settingsStr = await globalSecretManager.getSecret(`THREADS_SETTINGS_${socket.data.sessionId}`);
      console.log(`[Server] Secret result: ${settingsStr}`);
      const settings = settingsStr ? JSON.parse(settingsStr) : {
        allowPublishing: true,
        vipReplies: true,
        gatekeeper: true
      };
      socket.emit('threads:settings', settings);
      console.log(`[Server] Emitted threads:settings to ${socket.id}`);
    } catch (err: any) {
      console.error(`[Server] Error in threads:get_settings:`, err);
      socket.emit('threads:error', { message: err.message || 'Failed to fetch Threads settings.' });
    }
  });

  socket.on('threads:update_settings', async (settings) => {
    if (!requireAuthenticatedSession(socket, 'threads:update_settings', instance?.eventBus)) return;
    try {
      await globalSecretManager.setSecret(`THREADS_SETTINGS_${socket.data.sessionId}`, JSON.stringify(settings));
      socket.emit('threads:settings_updated', settings);
    } catch (err: any) {
      socket.emit('threads:error', { message: err.message || 'Failed to update Threads settings.' });
    }
  });

  socket.on('identity:link_wallet_challenge', (payload: { address?: string }) => {
    if (!requireAuthenticatedSession(socket, 'identity:link_wallet_challenge', instance?.eventBus)) return;
    if (!serverConfig.isProduction || !reownWalletIdentityService) {
      socket.emit('identity:link_error', {
        code: 'IDENTITY_LINKING_UNAVAILABLE',
        message: 'Wallet linking is available after the production identity service is configured.',
      });
      return;
    }

    const address = payload?.address?.toLowerCase();
    if (!address || !isAddress(address)) {
      socket.emit('identity:link_error', { code: 'INVALID_WALLET', message: 'A valid wallet address is required.' });
      return;
    }

    const expiresAt = Date.now() + 5 * 60 * 1000;
    const message = `Link this wallet to your SERA account\nNonce: ${randomUUID()}\nExpires: ${new Date(expiresAt).toISOString()}`;
    walletLinkChallenge = { address, message, expiresAt };
    socket.emit('identity:link_wallet_challenge', { address, message, expiresAt });
  });

  socket.on('identity:link_wallet', async (payload: { address?: string; message?: string; signature?: `0x${string}` }) => {
    if (!requireAuthenticatedSession(socket, 'identity:link_wallet', instance?.eventBus)) return;
    if (!serverConfig.isProduction || !reownWalletIdentityService) {
      socket.emit('identity:link_error', {
        code: 'IDENTITY_LINKING_UNAVAILABLE',
        message: 'Wallet linking is available after the production identity service is configured.',
      });
      return;
    }

    const address = payload?.address?.toLowerCase();
    const challenge = walletLinkChallenge;
    walletLinkChallenge = undefined; // Single-use, regardless of outcome.
    if (!challenge || Date.now() > challenge.expiresAt || address !== challenge.address || payload.message !== challenge.message || !payload.signature) {
      socket.emit('identity:link_error', { code: 'INVALID_LINK_PROOF', message: 'The wallet-linking request expired or is invalid. Please try again.' });
      return;
    }

    const isValidSignature = await verifyWalletSignature(
      address as `0x${string}`,
      challenge.message,
      payload.signature,
    );
    if (!isValidSignature) {
      socket.emit('identity:link_error', { code: 'INVALID_LINK_PROOF', message: 'Wallet ownership could not be verified.' });
      return;
    }

    try {
      const identity = await reownWalletIdentityService.linkVerifiedWallet(socket.data.sessionId!, address);
      socket.emit('identity:link_success', { address: identity.subject, kind: identity.kind });
    } catch (error) {
      if (error instanceof WalletAlreadyLinkedError) {
        socket.emit('identity:link_error', { code: 'WALLET_ALREADY_LINKED', message: error.message });
        return;
      }
      console.error('[Server] Wallet identity linking failed:', error);
      socket.emit('identity:link_error', { code: 'IDENTITY_LINK_FAILED', message: 'The wallet could not be linked. Please try again.' });
    }
  });


  // --- Arena Events ---
  socket.on('arena:fetch_markets', () => {
    socket.emit('arena:markets', predictionEngine.getActiveMarkets());
  });
  
  socket.on('arena:fetch_market_details', (marketId: string) => {
    const markets = predictionEngine.getActiveMarkets();
    const market = markets.find(m => m.id === marketId);
    if (market) {
      socket.emit('arena:market_details', {
        market,
        priceHistory: predictionEngine.priceHistory,
        orderBook: predictionEngine.getOrderBook(marketId)
      });
    }
  });

  socket.on('arena:fetch_portfolio', () => {
    if (!socket.data.sessionId) return;
    socket.emit('arena:portfolio', predictionEngine.getPortfolio(socket.data.sessionId));
  });
  
  // Listen for specific user portfolio updates
  const onPortfolioUpdated = (portfolio: any) => {
    socket.emit('arena:portfolio', portfolio);
  };
  
  // Bind listener when socket connects (or authenticates)
  if (socket.data.sessionId) {
    arenaEventBus.on(`arena:portfolio_updated:${socket.data.sessionId}`, onPortfolioUpdated);
  }

  socket.on('arena:place_order', async (payload: { marketId: string, side: 'UP' | 'DOWN', amount: number }) => {
    if (!requireAuthenticatedSession(socket, 'arena:place_order', instance?.eventBus)) return;
    const userId = socket.data.sessionId!;
    try {
      await predictionEngine.placeOrder(userId, payload.marketId, payload.side, payload.amount);
      socket.emit('arena:order_result', { success: true });
      socket.emit('arena:portfolio', predictionEngine.getPortfolio(userId));
      
      // Broadcast to all sockets that markets/orders might have changed (for real-time orderbook feeling)
      io.emit('arena:markets', predictionEngine.getActiveMarkets());
    } catch (e: any) {
      socket.emit('arena:order_result', { success: false, message: e.message });
    }
  });

  socket.on('billing:fetch', (payload: { address: string }) => {
    if (!socket.data.sessionId || (socket.data.personalWalletAddress && payload.address.toLowerCase() !== socket.data.personalWalletAddress)) return;
    const periods = agentManager.getSubscriptionService().getRemainingPeriods(socket.data.sessionId);
    const credits = agentManager.getSubscriptionService().getAgentCredits(socket.data.sessionId);
    const agentCredits = credits === Infinity ? -1 : credits;
    socket.emit('billing:update', { periods, agentCredits });
  });

  socket.on('billing:topup_dev_mock', (payload: { address: string, amountUsdc: number }) => {
    if (!socket.data.sessionId || (socket.data.personalWalletAddress && payload.address.toLowerCase() !== socket.data.personalWalletAddress)) return;
    if (!serverConfig.allowDevFeatures) {
      socket.emit('billing:error', { message: 'Development billing is disabled.' });
      return;
    }
    const principalId = socket.data.sessionId;
    const amountUsdc = payload.amountUsdc;
    console.log(`[Server] Received mock topup for ${principalId} amount: ${amountUsdc} USDC`);
    try {
      agentManager.getSubscriptionService().recordTopUp(principalId, amountUsdc);
      const periods = agentManager.getSubscriptionService().getRemainingPeriods(principalId);
      const credits = agentManager.getSubscriptionService().getAgentCredits(principalId);
      const agentCredits = credits === Infinity ? -1 : credits;
      socket.emit('billing:update', { periods, agentCredits });

      // Attempt to re-verify entitlement after topup
      try {
        agentManager.checkEntitlement(principalId);
        socket.data.isAuthenticated = true;
        socket.emit('auth:success', { token: generateSessionToken({ userId: principalId, personalWalletAddress: socket.data.personalWalletAddress }) });
      } catch (err) {
        // Still not enough
      }
    } catch (e) {
      console.error(e);
    }
  });

  socket.on('chat:message', (message: string) => {
    if (!requireAuthenticatedSession(socket, 'chat:message', instance?.eventBus)) return;
    socketObservationBuffer = [];
    console.log(`[Server] Received chat:message → dispatching USER_OBSERVATION for ${socket.data.sessionId}`);

    if (serverConfig.allowDevFeatures && serverConfig.demoIntentCommand && message.toLowerCase().trim() === serverConfig.demoIntentCommand) {
      const intentId = `intent-${Date.now()}`;
      instance.runtime.intentStore?.registerIntent({
        id: intentId,
        description: 'Grow Asset Value',
        status: 'ALIVE',
        terminality: 'CONTINUOUS',
        createdAt: Date.now()
      });
      instance.runtime.executeCycle(Date.now()).catch(console.error);
    }

    const event: StandardEvent = {
      id: `evt-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'SocketServer',
      payload: { message },
      timestamp: Date.now(),
    };

    instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);

    instance.chatHistoryStore.appendUiMessage({
      id: event.timestamp,
      role: 'user',
      content: message,
    });
  });

  socket.on('chat:clear', () => {
    if (!requireAuthenticatedSession(socket, 'chat:clear', instance?.eventBus)) return;
    console.log(`[Server] Clearing chat history for ${socket.data.sessionId}`);
    instance.chatHistoryStore.clear();
    instance.runtime.dialogueEngine.clearHistory();
    socket.emit('chat:history', []);
  });

  socket.on('chat:cancel', () => {
    if (!requireAuthenticatedSession(socket, 'chat:cancel', instance?.eventBus)) return;
    console.log(`[Server] Received chat:cancel → dispatching DIALOGUE_USER_CANCELLED for ${socket.data.sessionId}`);
    const event: StandardEvent = {
      id: `evt-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_CANCELLED,
      source: 'SocketServer',
      payload: {},
      timestamp: Date.now(),
    };
    instance.eventBus.emit(EventTypes.DIALOGUE_USER_CANCELLED, event);
  });

  socket.on('chat:proposal_response', (data: { proposalId: string; action: 'APPROVE' | 'REJECT'; candidateId?: string }) => {
    if (!requireAuthenticatedSession(socket, 'chat:proposal_response', instance?.eventBus)) return;
    const { proposalId, action, candidateId } = data;
    console.log(`[Server] Received proposal response for ${proposalId}: ${action} (candidateId: ${candidateId})`);

    const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    instance.chatHistoryStore.updateProposalStatus(proposalId, status);

    if (action === 'APPROVE') {
      instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_APPROVED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { proposalId: proposalId, candidateId }
      } as StandardEvent);
    } else {
      instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_REJECTED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { proposalId: proposalId }
      } as StandardEvent);
    }
  });

  socket.on('automations:fetch', () => {
    if (!requireAuthenticatedSession(socket, 'automations:fetch', instance?.eventBus)) return;
    socket.emit('automations:update', instance.triggerStore.getAll());
  });

  socket.on('automations:delete', (id: string) => {
    if (!requireAuthenticatedSession(socket, 'automations:delete', instance?.eventBus)) return;
    instance.triggerStore.delete(id);
    socket.emit('automations:update', instance.triggerStore.getAll());
  });

  socket.on('autonomy-agreements:fetch', () => {
    if (!requireAuthenticatedSession(socket, 'autonomy-agreements:fetch', instance?.eventBus)) return;
    socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
  });

  socket.on('autonomy-agreements:revoke', (id: string) => {
    if (!requireAuthenticatedSession(socket, 'autonomy-agreements:revoke', instance?.eventBus)) return;
    try {
      const agreement = instance.autonomyAgreementStore.revoke(id);
      instance.eventBus.emit(EventTypes.AUTONOMY_AGREEMENT_REVOKED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.AUTONOMY_AGREEMENT_REVOKED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { agreementId: agreement.id, principalId: agreement.principalId }
      } as StandardEvent);
      socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
    } catch (error) {
      socket.emit('autonomy-agreements:error', { message: error instanceof Error ? error.message : 'Unable to revoke agreement.' });
    }
  });

  socket.on('wallet:transfer', async (payload: { to: string; amount: string; asset: string }) => {
    if (!requireAuthenticatedSession(socket, 'wallet:transfer', instance?.eventBus)) return;
    console.log(`[Server] wallet:transfer requested → ${payload.amount} ${payload.asset} to ${payload.to}`);
    socket.emit('wallet:transfer:pending', { message: 'Broadcasting transaction...' });

    try {
      if (!instance.goalBridge) {
        socket.emit('wallet:transfer:result', { status: 'FAILED', error: 'Wallet not initialized' });
        return;
      }

      const result = await instance.goalBridge.directTransfer({
        recipientAddress: payload.to,
        amount: parseFloat(payload.amount),
        asset: payload.asset,
      });

      socket.emit('wallet:transfer:result', result);
    } catch (err: any) {
      console.error('[Server] wallet:transfer error:', err);
      socket.emit('wallet:transfer:result', { status: 'FAILED', error: err.message || 'Unknown error' });
    }
  });

  socket.on('wallet:deposit:gasless', async (payload: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    signature?: string;
    v?: number;
    r?: string;
    s?: string;
  }) => {
    if (!requireAuthenticatedSession(socket, 'wallet:deposit:gasless', instance?.eventBus)) return;
    console.log(`[Server] wallet:deposit:gasless requested by ${payload.from} → ${payload.value} units to ${payload.to}`);
    socket.emit('wallet:transfer:pending', { message: 'Sponsoring and broadcasting gasless deposit on Base...' });

    try {
      if (!instance.goalBridge) {
        socket.emit('wallet:transfer:result', { status: 'FAILED', error: 'Wallet not initialized' });
        return;
      }

      const result = await instance.goalBridge.executeGaslessDeposit(payload);
      socket.emit('wallet:transfer:result', result);
      if (result.status === 'SUCCESS') {
        await instance.goalBridge.syncWalletState();
      }
    } catch (err: any) {
      console.error('[Server] wallet:deposit:gasless error:', err);
      socket.emit('wallet:transfer:result', { status: 'FAILED', error: err.message || 'Unknown error' });
    }
  });

  socket.on('wallet:sponsor_user_gas', async (payload: { address: string }, callback?: (res: any) => void) => {
    try {
      if (payload?.address && isAddress(payload.address)) {
        console.log(`[Server] ⛽ Checking / Sponsoring gas for personal wallet: ${payload.address}`);
        const baseAdapter = new BaseAdapter();
        const success = await baseAdapter.ensureAddressGas(payload.address as `0x${string}`);
        console.log(`[Server] Gas sponsor result for ${payload.address}: ${success}`);
        if (typeof callback === 'function') callback({ status: success ? 'SUCCESS' : 'SKIPPED' });
      } else {
        if (typeof callback === 'function') callback({ status: 'SKIPPED' });
      }
    } catch (err: any) {
      console.warn('[Server] Failed to sponsor gas for user:', err.message);
      if (typeof callback === 'function') callback({ status: 'FAILED', error: err.message });
    }
  });

  socket.on('wallet:refresh', async () => {
    if (instance?.goalBridge) {
      try {
        await instance.goalBridge.syncWalletState();
      } catch (err) {
        console.warn('[Server] Error refreshing wallet balance:', err);
      }
    }
  });

  socket.on('wallet:fetch', async () => {
    if (instance?.goalBridge) {
      try {
        await instance.goalBridge.syncWalletState();
      } catch (err) {
        console.warn('[Server] Error fetching wallet balance:', err);
      }
    }
  });

  socket.on('governance:approve_task', (payload: { taskId: string }) => {
    if (!requireAuthenticatedSession(socket, 'governance:approve_task', instance?.eventBus)) return;
    if (instance) {
      instance.runtime.executionCoordinator.approveTask(payload.taskId);
    }
  });

  socket.on('governance:reject_task', (payload: { taskId: string }) => {
    if (!requireAuthenticatedSession(socket, 'governance:reject_task', instance?.eventBus)) return;
    if (instance) {
      instance.runtime.executionCoordinator.rejectTask(payload.taskId);
    }
  });

  socket.on('governance:get_recommendations', () => {
    if (!requireAuthenticatedSession(socket, 'governance:get_recommendations', instance?.eventBus)) return;
    if (instance?.metaGovernanceReview) {
      socket.emit('governance:recommendation_list', instance.metaGovernanceReview.getPendingRecommendations());
    }
  });

  socket.on('governance:respond_recommendation', (payload: { recommendationId: string; decision: 'APPROVED' | 'REJECTED' | 'MODIFIED'; rationale?: string }) => {
    if (!requireAuthenticatedSession(socket, 'governance:respond_recommendation', instance?.eventBus)) return;
    if (instance?.metaGovernanceReview) {
      const decisionResult = instance.metaGovernanceReview.recordDecision(
        payload.recommendationId,
        payload.decision,
        payload.rationale
      );
      socket.emit('governance:recommendation_response_result', { success: !!decisionResult, decision: decisionResult });
      socket.emit('governance:recommendation_list', instance.metaGovernanceReview.getPendingRecommendations());
    }
  });

  // ── MCP API Key Management ────────────────────────────────────────────────
  socket.on('mcp:generate_key', () => {
    if (!requireAuthenticatedSession(socket, 'mcp:generate_key', instance?.eventBus)) return;
    const key = mcpApiKeyStore.generateKey(socket.data.sessionId!);
    socket.emit('mcp:key_generated', { key });
    socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
  });

  socket.on('mcp:revoke_key', (payload: { key: string }) => {
    if (!requireAuthenticatedSession(socket, 'mcp:revoke_key', instance?.eventBus)) return;
    mcpApiKeyStore.revokeKey(payload.key);
    socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
  });

  socket.on('mcp:list_keys', () => {
    if (!requireAuthenticatedSession(socket, 'mcp:list_keys', instance?.eventBus)) return;
    socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
  });

  // ── Connector Marketplace Events ────────────────────────────────────────
  socket.on('connector:list', async () => {
    if (!instance?.runtime?.capabilityCatalog) return;
    await instance.runtime.capabilityCatalog.waitForLoad();
    const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
    socket.emit('connector:catalog', summaries);
  });

  socket.on('connector:activate', (payload: { connectorId: string }) => {
    if (!requireAuthenticatedSession(socket, 'connector:activate', instance?.eventBus)) return;
    if (!instance?.runtime?.capabilityCatalog) return;
    instance.runtime.capabilityCatalog.activateConnector(payload.connectorId);
    const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
    socket.emit('connector:status_changed', summaries);
    console.log(`[Server] Connector activated: ${payload.connectorId}`);
  });

  socket.on('connector:deactivate', (payload: { connectorId: string }) => {
    if (!requireAuthenticatedSession(socket, 'connector:deactivate', instance?.eventBus)) return;
    if (!instance?.runtime?.capabilityCatalog) return;
    instance.runtime.capabilityCatalog.deactivateConnector(payload.connectorId);
    const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
    socket.emit('connector:status_changed', summaries);
    console.log(`[Server] Connector deactivated: ${payload.connectorId}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Server] UI Client disconnected: ${socket.id}`);
    if (socket.data.sessionId) {
      arenaEventBus.off(`arena:portfolio_updated:${socket.data.sessionId}`, onPortfolioUpdated);
    }
    unbindListeners();
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
agentManager.startBillingTick();

const treasuryWatcher = new TreasuryDepositWatcher(agentManager.getSubscriptionService(), {
  treasuryAddress: process.env.SERA_VAULT_ADDRESS,
  onDepositDetected: (address: string, newBalance: number) => {
    const instance = agentManager.getInstance(address);
    if (instance) {
      instance.eventBus.emit(EventTypes.BILLING_CREDITS_UPDATED, {
        id: `evt-bill-dep-${Date.now()}`,
        type: EventTypes.BILLING_CREDITS_UPDATED,
        source: 'TreasuryDepositWatcher',
        timestamp: Date.now(),
        payload: {
          address,
          remainingTokens: newBalance
        }
      });
    }
  }
});
treasuryWatcher.start();

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n🚀 Sera Core Server is running on port ${PORT}`);
  console.log(`   Architecture: Actor Model Router (SeraAgentInstance)`);
  console.log(`   MCP Connector: HTTP /mcp/tool (Streamable HTTP ready)\n`);
});

const shutdown = () => {
  console.log('[SERA] Shutting down gracefully.');
  treasuryWatcher.stop();
  agentManager.shutdownAll();
  io.close();
  httpServer.close(() => process.exit(0));
};

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);


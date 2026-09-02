import * as dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { agentManager } from './AgentManager';
import { isAllowedOrigin } from './config';
import { SupabaseIdentityService } from '../core/identity/SupabaseIdentityService';
import { ReownWalletIdentityService } from '../core/identity/ReownWalletIdentityService';
import { GoogleDriveOAuthService } from '../core/integrations/google-drive/GoogleDriveOAuthService';
import { TreasuryDepositWatcher } from './billing/TreasuryDepositWatcher';
import { McpApiKeyStore } from '../mcp/McpApiKeyStore';
import { SeraMcpServer } from '../mcp/SeraMcpServer';
import { OAuthStore } from './auth/oauth/OAuthStore';
import { createOAuthRouter } from './auth/oauth/oauthRouter';
import { TelegramBotManager } from '../capabilities/communication/adapters/TelegramBotManager';
import { TelegramAdapter } from '../capabilities/communication/adapters/TelegramAdapter';
import { createThreadsAuthRouter, ThreadsOAuthService } from './auth/threadsAuth';
import { SupabaseRestClient } from '../core/persistence/SupabaseRestClient';
import { EventTypes } from '../core/events/types';

// Modular Route & Gateway Adapters
import { createTemporalRouter } from './routes/temporalRoutes';
import { createGoogleDriveRouter } from './routes/googleDriveRoutes';
import { createMediaRouter } from './routes/mediaRoutes';
import { createMcpRouter } from './routes/mcpRoutes';
import { registerSocketGateway } from './socket/SocketGateway';


// ── Identity & OAuth Services Initialization ────────────────────────────────
const supabaseIdentityService = SupabaseIdentityService.fromEnvironment();
const reownWalletIdentityService = ReownWalletIdentityService.fromEnvironment();
const googleDriveOAuthService = GoogleDriveOAuthService.fromEnvironment();
const globalSecretManager = agentManager.getOrCreateInstance('dev').runtime.secretManager;
agentManager.setSecretManager(globalSecretManager);

export const globalOAuthStore = new OAuthStore(globalSecretManager);
export const mcpApiKeyStore = new McpApiKeyStore(globalOAuthStore);
export const telegramBotManager = new TelegramBotManager(agentManager, globalSecretManager, process.env.TELEGRAM_BOT_TOKEN);
const threadsOAuthService = new ThreadsOAuthService(globalSecretManager);

console.log(`[Server] Services Init - Supabase: ${process.env.SUPABASE_URL ? 'OK' : 'MISSING'}, Reown: ${reownWalletIdentityService ? 'ACTIVE' : 'LOCAL'}, GDrive: ${!!googleDriveOAuthService}, Threads: ${threadsOAuthService.appId ? 'OK' : 'MISSING'}`);

const supabaseClient = SupabaseRestClient.fromEnvironment();

// ── Communication Bridges ───────────────────────────────────────────────────
agentManager.onInstanceCreated((instance) => {
  instance.communicationBridge.registerAdapter(
    'telegram',
    new TelegramAdapter(instance.sessionId, telegramBotManager, instance.eventBus)
  );
});

// ── Express App & HTTP Server ───────────────────────────────────────────────
const app = express();

// Global CORS Middleware for API routes
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-cron-key, Mcp-Session-Id');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '25mb' }));

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    methods: ['GET', 'POST'],
  },
});

// ── MCP Server Instance ─────────────────────────────────────────────────────
const seraMcpServer = new SeraMcpServer({
  apiKeyStore: mcpApiKeyStore,
  resolveInstance: (userId: string) => agentManager.getOrCreateInstance(userId),
  getSubscriptionService: () => agentManager.getSubscriptionService(),
});

// ── Route Mounting ──────────────────────────────────────────────────────────
// 1. Health Probe
app.get('/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'sera-core' });
});

// 2. Canonical Temporal Heartbeat
app.use(createTemporalRouter(agentManager, supabaseClient));

// 3. Google Drive OAuth Callback
app.use(createGoogleDriveRouter(googleDriveOAuthService, io));

// 4. Multimodal Image Uploads
app.use(createMediaRouter());

// 5. OAuth 2.0 Authorization Server & Dynamic Client Registration (RFC 7591)
app.use(createOAuthRouter(globalOAuthStore));

// 6. Meta Threads OAuth
app.use('/api/auth/threads', createThreadsAuthRouter(threadsOAuthService, globalSecretManager, (sessionId) => {
  io.to(`user:${sessionId}`).emit('threads:status', { provider: 'THREADS', status: 'CONNECTED' });
  const inst = agentManager.getOrCreateInstance(sessionId);
  if (inst?.runtime?.capabilityCatalog) {
    io.to(`user:${sessionId}`).emit('connector:status_changed', inst.runtime.capabilityCatalog.allConnectorSummaries());
  }
}));

// 7. MCP Streamable HTTP & SSE Transports
app.use(createMcpRouter({ mcpApiKeyStore, seraMcpServer, agentManager }));

// ── Socket.IO Gateway ───────────────────────────────────────────────────────
registerSocketGateway(io, {
  agentManager,
  googleDriveOAuthService,
  threadsOAuthService,
  telegramBotManager,
  mcpApiKeyStore,
  globalOAuthStore,
  globalSecretManager,
  supabaseIdentityService,
  reownWalletIdentityService
});

// ── Server Boot & Treasury Watcher ──────────────────────────────────────────
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

// Initial hydration of all cloud sessions on boot
void agentManager.hydrateAllSessionsFromCloud(supabaseClient).then((count) => {
  console.log(`[Server] Hydrated ${count} active user session(s) from Supabase on boot.`);
});

httpServer.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n🚀 Sera Core Server is running on port ${PORT}`);
  console.log(`   Architecture: Actor Model Router (SeraAgentInstance)`);
  console.log(`   MCP Connector: Streamable HTTP + SSE ready\n`);
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

import { SocketSessionContext } from './types';
import { requireAuthenticatedSession } from '../../SessionGuard';

/**
 * Registers third-party channel integrations (Google Drive, Threads, Telegram, WhatsApp),
 * Model Context Protocol (MCP) link codes & API keys, and connector marketplace events.
 */
export function registerIntegrationHandlers(context: SocketSessionContext): void {
  const {
    socket,
    deps: {
      agentManager,
      googleDriveOAuthService,
      threadsOAuthService,
      telegramBotManager,
      whatsAppManager,
      mcpApiKeyStore,
      globalOAuthStore,
      globalSecretManager
    },
    getInstance
  } = context;

  // ── Google Drive ──────────────────────────────────────────────────────────
  socket.on('google_drive:connect', () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'google_drive:connect', instance?.eventBus)) return;
    if (!googleDriveOAuthService) {
      socket.emit('google_drive:error', { message: 'Google Drive connection is not configured for this environment.' });
      return;
    }
    socket.emit('google_drive:authorization', { authorizationUrl: googleDriveOAuthService.beginAuthorization(socket.data.sessionId!) });
  });

  socket.on('google_drive:disconnect', async () => {
    const instance = getInstance();
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

  // ── Telegram ──────────────────────────────────────────────────────────────
  socket.on('telegram:generate_link', async () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'telegram:generate_link', instance?.eventBus)) return;
    if (!telegramBotManager.isEnabled()) {
      socket.emit('telegram:error', { message: 'Telegram Bot is not configured on this server.' });
      return;
    }
    const code = await telegramBotManager.generateLinkCode(socket.data.sessionId);
    socket.emit('telegram:link_generated', { code });
  });

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  socket.on('whatsapp:generate_link', async () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'whatsapp:generate_link', instance?.eventBus)) return;
    if (!whatsAppManager.isEnabled()) {
      socket.emit('whatsapp:error', { message: 'WhatsApp integration is not configured on this server.' });
      return;
    }
    try {
      const { code, deepLink } = await whatsAppManager.generateLinkCode(socket.data.sessionId!);
      socket.emit('whatsapp:link_generated', { code, deepLink });
    } catch (err: any) {
      socket.emit('whatsapp:error', { message: err.message || 'Failed to generate WhatsApp pairing link.' });
    }
  });

  socket.on('whatsapp:get_status', async () => {
    const sessionId = socket.data.sessionId || 'dev';
    try {
      const status = await whatsAppManager.getStatus(sessionId);
      socket.emit('whatsapp:status', status);
      if (status.status === 'CONNECTED' && socket.data.sessionId) {
        const inst = agentManager.getOrCreateInstance(socket.data.sessionId);
        if (inst?.runtime?.capabilityCatalog && !inst.runtime.capabilityCatalog.isConnectorActive('whatsapp')) {
          inst.runtime.capabilityCatalog.activateConnector('whatsapp');
          socket.emit('connector:catalog', inst.runtime.capabilityCatalog.allConnectorSummaries());
        }
      }
    } catch (err: any) {
      socket.emit('whatsapp:error', { message: err.message || 'Failed to get WhatsApp status.' });
    }
  });

  socket.on('whatsapp:disconnect', async () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'whatsapp:disconnect', instance?.eventBus)) return;
    try {
      await whatsAppManager.disconnect(socket.data.sessionId!);
      socket.emit('whatsapp:status', { provider: 'WHATSAPP', status: 'NOT_CONNECTED' });
      const inst = agentManager.getInstance(socket.data.sessionId!);
      if (inst?.runtime?.capabilityCatalog) {
        inst.runtime.capabilityCatalog.deactivateConnector('whatsapp');
        socket.emit('connector:catalog', inst.runtime.capabilityCatalog.allConnectorSummaries());
        socket.emit('connector:status_changed', inst.runtime.capabilityCatalog.allConnectorSummaries());
      }
    } catch (err: any) {
      socket.emit('whatsapp:error', { message: err.message || 'Failed to disconnect WhatsApp.' });
    }
  });

  // ── Threads ───────────────────────────────────────────────────────────────
  socket.on('threads:connect', () => {
    const instance = getInstance();
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
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'threads:disconnect', instance?.eventBus)) return;
    if (socket.data.sessionId === 'dev') {
      socket.emit('threads:status', { provider: 'THREADS', status: 'NOT_CONNECTED' });
      return;
    }
    try {
      const status = await threadsOAuthService.disconnect(socket.data.sessionId!);
      socket.emit('threads:status', status);
      const inst = getInstance();
      if (inst?.runtime?.capabilityCatalog) {
        socket.emit('connector:status_changed', inst.runtime.capabilityCatalog.allConnectorSummaries());
      }
    } catch (err: any) {
      socket.emit('threads:error', { message: err.message || 'Failed to disconnect Threads.' });
    }
  });

  socket.on('threads:get_settings', async () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'threads:get_settings', instance?.eventBus)) return;
    try {
      const settingsStr = await globalSecretManager.getSecret(`THREADS_SETTINGS_${socket.data.sessionId}`);
      const settings = settingsStr ? JSON.parse(settingsStr) : {
        allowPublishing: true,
        vipReplies: true,
        gatekeeper: true
      };
      socket.emit('threads:settings', settings);
    } catch (err: any) {
      console.error(`[Server] Error in threads:get_settings:`, err);
      socket.emit('threads:error', { message: err.message || 'Failed to fetch Threads settings.' });
    }
  });

  socket.on('threads:update_settings', async (settings) => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'threads:update_settings', instance?.eventBus)) return;
    try {
      await globalSecretManager.setSecret(`THREADS_SETTINGS_${socket.data.sessionId}`, JSON.stringify(settings));
      socket.emit('threads:settings_updated', settings);
    } catch (err: any) {
      socket.emit('threads:error', { message: err.message || 'Failed to update Threads settings.' });
    }
  });

  // ── MCP API Key Management ────────────────────────────────────────────────
  socket.on('mcp:generate_key', () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'mcp:generate_key', instance?.eventBus)) return;
    const key = mcpApiKeyStore.generateKey(socket.data.sessionId!);
    socket.emit('mcp:key_generated', { key });
    socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
  });

  socket.on('mcp:revoke_key', (payload: { key: string }) => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'mcp:revoke_key', instance?.eventBus)) return;
    mcpApiKeyStore.revokeKey(payload.key);
    socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
  });

  socket.on('mcp:list_keys', () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'mcp:list_keys', instance?.eventBus)) return;
    socket.emit('mcp:keys_list', mcpApiKeyStore.listKeys(socket.data.sessionId!));
  });

  // ── MCP 6-Digit Link Code & Platform Management ──────────────────────────
  socket.on('mcp:generate_link_code', () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'mcp:generate_link_code', instance?.eventBus)) return;
    try {
      const codeData = globalOAuthStore.createLinkCode(socket.data.sessionId!.toLowerCase());
      socket.emit('mcp:link_code_generated', codeData);
    } catch (err: any) {
      socket.emit('mcp:link_code_error', { message: err.message });
    }
  });

  socket.on('mcp:list_platforms', () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'mcp:list_platforms', instance?.eventBus)) return;
    const platforms = globalOAuthStore.listConnectedPlatforms(socket.data.sessionId!.toLowerCase());
    socket.emit('mcp:platforms_list', platforms);
  });

  socket.on('mcp:disconnect_platform', (payload: { clientId?: string }) => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'mcp:disconnect_platform', instance?.eventBus)) return;
    globalOAuthStore.revokePlatformSession(socket.data.sessionId!.toLowerCase(), payload?.clientId);
    const platforms = globalOAuthStore.listConnectedPlatforms(socket.data.sessionId!.toLowerCase());
    socket.emit('mcp:platforms_list', platforms);
  });

  // ── Connector Marketplace Events ──────────────────────────────────────────
  socket.on('connector:list', async () => {
    const instance = getInstance();
    if (!instance?.runtime?.capabilityCatalog) return;
    await instance.runtime.capabilityCatalog.waitForLoad();
    const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
    socket.emit('connector:catalog', summaries);
  });

  socket.on('connector:activate', (payload: { connectorId: string }) => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'connector:activate', instance?.eventBus)) return;
    if (!instance?.runtime?.capabilityCatalog) return;
    instance.runtime.capabilityCatalog.activateConnector(payload.connectorId);
    const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
    socket.emit('connector:status_changed', summaries);
    console.log(`[Server] Connector activated: ${payload.connectorId}`);
  });

  socket.on('connector:deactivate', (payload: { connectorId: string }) => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'connector:deactivate', instance?.eventBus)) return;
    if (!instance?.runtime?.capabilityCatalog) return;
    instance.runtime.capabilityCatalog.deactivateConnector(payload.connectorId);
    const summaries = instance.runtime.capabilityCatalog.allConnectorSummaries();
    socket.emit('connector:status_changed', summaries);
    console.log(`[Server] Connector deactivated: ${payload.connectorId}`);
  });
}

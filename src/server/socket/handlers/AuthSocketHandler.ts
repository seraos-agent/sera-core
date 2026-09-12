import { randomUUID } from 'crypto';
import { isAddress } from 'viem';
import { SocketSessionContext } from './types';
import { serverConfig } from '../../config';
import { requireAuthenticatedSession } from '../../SessionGuard';
import { verifyWalletSignature } from '../../WalletSignatureVerifier';
import { resolveVerifiedWalletIdentity } from '../../../core/identity/WalletIdentityResolver';
import { WalletAlreadyLinkedError } from '../../../core/identity/ReownWalletIdentityService';
import { SeraUserContext } from '../../../core/identity/types';
import { generateSessionToken, verifySessionToken } from '../socketAuth';
import { SubscriptionRequiredError } from '../../AgentManager';
import { EventTypes } from '../../../core/events/types';

const challengeCache = new Map<string, string>();

/**
 * Registers Web3 wallet authentication, challenge generation, login, logout,
 * and multi-wallet identity linking handlers.
 */
export function registerAuthHandlers(context: SocketSessionContext): void {
  const {
    socket,
    deps: { agentManager, supabaseIdentityService, reownWalletIdentityService },
    getInstance,
    setInstance,
    bindListeners,
    unbindListeners,
    sendInitialState,
    setWalletLinkChallenge,
    getWalletLinkChallenge
  } = context;

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
      setTimeout(() => challengeCache.delete(address), 5 * 60 * 1000);
    }
    socket.emit('auth:challenge', { message });
  };

  socket.on('auth:challenge', issueLoginChallenge);

  socket.on('auth:login', async (payload: { address?: string; message?: string; signature?: `0x${string}`; token?: string; supabaseAccessToken?: string; telegramInitData?: string }) => {
    let address = payload?.address?.toLowerCase();
    let principal: SeraUserContext;

    if (payload.token) {
      const recoveredPrincipal = verifySessionToken(payload.token);

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
        principal = resolveVerifiedWalletIdentity(address);
      }
    }

    const newToken = generateSessionToken(principal!);
    socket.emit('auth:success', { token: newToken });

    if (socket.data.sessionId && socket.data.sessionId !== 'dev') socket.leave(`user:${socket.data.sessionId}`);
    unbindListeners();
    socket.data.sessionId = principal!.userId;
    socket.data.personalWalletAddress = principal!.personalWalletAddress;
    socket.data.loginMessage = undefined;
    
    const newInstance = agentManager.getOrCreateInstance(principal!);
    setInstance(newInstance);
    bindListeners();
    await sendInitialState();

    try {
      agentManager.checkEntitlement(principal!.userId);
    } catch (err) {
      if (err instanceof SubscriptionRequiredError) {
        agentManager.getSubscriptionService().addCreditsDirectly(principal!.userId, 1000000);
        console.log(`[Server] Granted 1,000,000 welcome tokens to ${principal!.userId}`);

        newInstance.eventBus.emit(EventTypes.BILLING_CREDITS_UPDATED, {
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

    if (newInstance?.goalBridge) {
      newInstance.goalBridge.syncWalletState().catch(err => {
        console.warn('[Server] Failed to refresh wallet balance on login:', err);
      });
    }
  });

  socket.on('auth:logout', () => {
    unbindListeners();
    if (socket.data.sessionId && socket.data.sessionId !== 'dev') socket.leave(`user:${socket.data.sessionId}`);
    setWalletLinkChallenge(undefined);
    socket.data.isAuthenticated = false;
    socket.data.sessionId = 'dev';
    socket.data.personalWalletAddress = undefined;
    socket.data.loginMessage = undefined;
    setInstance(agentManager.getOrCreateInstance('dev'));
    socket.emit('auth:logged_out');
  });

  socket.on('identity:link_wallet_challenge', (payload: { address?: string }) => {
    const instance = getInstance();
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
    const challenge = { address, message, expiresAt };
    setWalletLinkChallenge(challenge);
    socket.emit('identity:link_wallet_challenge', { address, message, expiresAt });
  });

  socket.on('identity:link_wallet', async (payload: { address?: string; message?: string; signature?: `0x${string}` }) => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'identity:link_wallet', instance?.eventBus)) return;
    if (!serverConfig.isProduction || !reownWalletIdentityService) {
      socket.emit('identity:link_error', {
        code: 'IDENTITY_LINKING_UNAVAILABLE',
        message: 'Wallet linking is available after the production identity service is configured.',
      });
      return;
    }

    const address = payload?.address?.toLowerCase();
    const challenge = getWalletLinkChallenge();
    setWalletLinkChallenge(undefined);
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
    } catch (error: any) {
      if (error instanceof WalletAlreadyLinkedError) {
        socket.emit('identity:link_error', { code: 'WALLET_ALREADY_LINKED', message: error.message });
        return;
      }
      console.error('[Server] Wallet identity linking failed:', error);
      socket.emit('identity:link_error', { code: 'IDENTITY_LINK_FAILED', message: 'The wallet could not be linked. Please try again.' });
    }
  });
}

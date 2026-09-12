import { isAddress } from 'viem';
import { SocketSessionContext } from './types';
import { requireAuthenticatedSession } from '../../SessionGuard';
import { serverConfig } from '../../config';
import { BaseAdapter } from '../../../capabilities/wallet/chains/BaseAdapter';
import { generateSessionToken } from '../socketAuth';
import { StandardEvent, EventTypes } from '../../../core/events/types';

/**
 * Registers on-chain wallet transfers, gasless deposits, gas sponsorship,
 * billing credit inquiries, automations, and autonomy agreements.
 */
export function registerWalletHandlers(context: SocketSessionContext): void {
  const {
    socket,
    deps: { agentManager },
    getInstance
  } = context;

  // ── Billing ───────────────────────────────────────────────────────────────
  socket.on('billing:fetch', (payload: { address: string }) => {
    if (!socket.data.sessionId || (socket.data.personalWalletAddress && payload.address.toLowerCase() !== socket.data.personalWalletAddress)) return;
    const periods = agentManager.getSubscriptionService().getRemainingPeriods(socket.data.sessionId);
    const credits = agentManager.getSubscriptionService().getAgentCredits(socket.data.sessionId);
    const agentCredits = credits === Infinity ? -1 : credits;
    socket.emit('billing:update', { periods, agentCredits });
  });

  socket.on('billing:topup_dev_mock', (payload: { address: string; amountUsdc: number }) => {
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

      try {
        agentManager.checkEntitlement(principalId);
        socket.data.isAuthenticated = true;
        socket.emit('auth:success', { token: generateSessionToken({ userId: principalId, personalWalletAddress: socket.data.personalWalletAddress }) });
      } catch (err) {}
    } catch (e) {
      console.error(e);
    }
  });

  // ── Automations ───────────────────────────────────────────────────────────
  socket.on('automations:fetch', async () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'automations:fetch', instance?.eventBus)) return;
    try {
      await instance.triggerStore.ensureLoaded();
    } catch {}
    socket.emit('automations:update', instance.triggerStore.getAll());
  });

  socket.on('automations:delete', (id: string) => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'automations:delete', instance?.eventBus)) return;
    instance.triggerStore.delete(id);
    socket.emit('automations:update', instance.triggerStore.getAll());
  });

  // ── Autonomy Agreements ───────────────────────────────────────────────────
  socket.on('autonomy-agreements:fetch', () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'autonomy-agreements:fetch', instance?.eventBus)) return;
    socket.emit('autonomy-agreements:update', instance.autonomyAgreementStore.getAll());
  });

  socket.on('autonomy-agreements:revoke', (id: string) => {
    const instance = getInstance();
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

  // ── Wallet On-Chain Operations ────────────────────────────────────────────
  socket.on('wallet:transfer', async (payload: { to: string; amount: string; asset: string }) => {
    const instance = getInstance();
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
    const instance = getInstance();
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
    const instance = getInstance();
    if (instance?.goalBridge) {
      try {
        await instance.goalBridge.syncWalletState();
      } catch (err) {
        console.warn('[Server] Error refreshing wallet balance:', err);
      }
    }
  });

  socket.on('wallet:fetch', async () => {
    const instance = getInstance();
    if (instance?.goalBridge) {
      try {
        await instance.goalBridge.syncWalletState();
      } catch (err) {
        console.warn('[Server] Error fetching wallet balance:', err);
      }
    }
  });
}

import { describe, expect, it } from 'vitest';
import { InMemoryWalletAccountRepository, TwinWalletRegistry } from '../src/core/identity/TwinWalletRegistry';

describe('TwinWalletRegistry', () => {
  it('creates exactly one personal and one provisionable agent wallet per user', async () => {
    const registry = new TwinWalletRegistry(new InMemoryWalletAccountRepository());
    const first = await registry.ensure({
      userId: 'user-1',
      personal: { provider: 'EXTERNAL', chain: 'base-mainnet', address: '0xAbC', status: 'READY' },
    });
    const second = await registry.ensure({
      userId: 'user-1',
      personal: { provider: 'EXTERNAL', chain: 'base-mainnet', address: '0xdef', status: 'READY' },
    });

    expect(first.personalWallet.kind).toBe('PERSONAL');
    expect(first.agentWallet.kind).toBe('AGENT');
    expect(first.agentWallet.status).toBe('PROVISIONING');
    expect(second.personalWallet.id).toBe(first.personalWallet.id);
    expect(second.agentWallet.id).toBe(first.agentWallet.id);
  });
});

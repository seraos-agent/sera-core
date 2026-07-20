import { describe, expect, it } from 'vitest';
import { InMemoryWalletAccountRepository } from '../src/core/identity/TwinWalletRegistry';
import { ThirdwebAgentWalletProvisioner } from '../src/core/identity/ThirdwebAgentWalletProvisioner';

describe('ThirdwebAgentWalletProvisioner', () => {
  it('maps a stable SERA user ID to one ready Agent Wallet record', async () => {
    const repository = new InMemoryWalletAccountRepository();
    const initializeAgentWallet = async (userId?: string) => ({
      address: '0x1111111111111111111111111111111111111111',
      network: `Base ${userId}`,
    });
    const provisioner = new ThirdwebAgentWalletProvisioner(repository, { initializeAgentWallet });

    const first = await provisioner.ensureForUser('sera-user-42');
    const second = await provisioner.ensureForUser('sera-user-42');

    expect(first).toMatchObject({
      userId: 'sera-user-42',
      kind: 'AGENT',
      provider: 'THIRDWEB',
      providerWalletId: 'sera-agent:sera-user-42',
      status: 'READY',
    });
    expect(second.id).toBe(first.id);
  });
});

import { describe, expect, it } from 'vitest';
import { createWalletCustodyProvider } from '../src/capabilities/wallet/WalletCustodyProviderFactory';

describe('Wallet custody provider selection', () => {
  it('permits local key custody only outside production', () => {
    const previous = process.env.MASTER_ENCRYPTION_KEY;
    process.env.MASTER_ENCRYPTION_KEY = '0'.repeat(64);
    try {
      expect(createWalletCustodyProvider('test', 'local_development').providerId).toBe('local_development');
      expect(() => createWalletCustodyProvider('production', 'local_development')).toThrow(/prohibited in production/);
    } finally {
      if (previous === undefined) delete process.env.MASTER_ENCRYPTION_KEY;
      else process.env.MASTER_ENCRYPTION_KEY = previous;
    }
  });

  it('fails closed until a managed provider is configured', () => {
    expect(() => createWalletCustodyProvider('production', 'thirdweb')).toThrow(/not configured/);
  });
});

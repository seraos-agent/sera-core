import { WalletCustodyProvider, WalletCustodyUnavailableError } from './WalletCustodyProvider';
import { LocalDevelopmentCustodyProvider } from './LocalDevelopmentCustodyProvider';

export type WalletCustodyProviderName = 'local_development' | 'thirdweb' | 'base_subaccount';

/**
 * Production is deliberately fail-closed. Until the selected managed-custody
 * adapter has been configured and verified on testnet, SERA must not fall back
 * to generating a server-side private key.
 */
export function createWalletCustodyProvider(
  environment = process.env.NODE_ENV ?? 'development',
  configuredProvider = process.env.SERA_WALLET_CUSTODY_PROVIDER ?? 'local_development',
): WalletCustodyProvider {
  const provider = configuredProvider as WalletCustodyProviderName;
  if (provider === 'local_development') {
    if (environment === 'production') {
      throw new WalletCustodyUnavailableError(
        'SERA_WALLET_CUSTODY_PROVIDER=local_development is prohibited in production. Configure a managed custody provider.',
      );
    }
    return new LocalDevelopmentCustodyProvider();
  }

  throw new WalletCustodyUnavailableError(
    `Wallet custody provider "${configuredProvider}" is selected but not configured. Managed custody must be verified on testnet before activation.`,
  );
}

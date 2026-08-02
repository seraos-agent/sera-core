import { ExecutionContext } from '../../core/execution/ExecutionContext';
import { SeraUserId } from '../../core/identity/types';
import { EncryptedDatabaseSecretStore } from '../../core/secrets/stores/EncryptedDatabaseSecretStore';
import { SecretManager } from '../../core/secrets/SecretManager';
import { ExecutionReceipt, WalletId } from './types';
import { SpendPermissionAdapter } from './SpendPermissionAdapter';
import { UniversalAgenticWallet } from './UniversalAgenticWallet';
import { WalletCustodyProvider } from './WalletCustodyProvider';

/**
 * Legacy local-key provider. It exists only to preserve local/testnet work;
 * the factory refuses to construct it in production.
 */
export class LocalDevelopmentCustodyProvider implements WalletCustodyProvider {
  readonly providerId = 'local_development';
  private readonly wallet = new UniversalAgenticWallet(
    new SecretManager(new EncryptedDatabaseSecretStore()),
    new SpendPermissionAdapter(),
  );

  initializeAgentWallet(userId?: SeraUserId): Promise<WalletId> {
    return this.wallet.initialize(userId);
  }

  getBalance(walletId: WalletId, asset: string, network?: string): Promise<number> {
    return this.wallet.getBalance(walletId, asset, network);
  }

  getAddressBalance(address: string, asset: string, network?: string): Promise<number> {
    return this.wallet.getAddressBalance(address, asset, network);
  }

  execute(walletId: WalletId, context: ExecutionContext<any>): Promise<ExecutionReceipt> {
    return this.wallet.execute(walletId, context);
  }
}

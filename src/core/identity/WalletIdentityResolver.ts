import { SeraUserContext } from './types';

/**
 * Compatibility resolver for the current wallet-signature login. It gives the
 * address flow an explicit principal boundary while Supabase becomes the
 * production source of SeraUserId. It must never merge two users implicitly.
 */
export function resolveVerifiedWalletIdentity(address: string): SeraUserContext {
  const personalWalletAddress = address.toLowerCase();
  return { userId: `wallet:${personalWalletAddress}`, personalWalletAddress };
}

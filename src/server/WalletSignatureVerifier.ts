import { createPublicClient, http, type Address, type Hex } from 'viem';
import { base } from 'viem/chains';

/**
 * Server-side ownership proof for both EOAs and ERC-1271/ERC-6492 smart
 * accounts. Reown email/social wallets can be counterfactual smart accounts,
 * so local address recovery alone is not sufficient.
 */
export async function verifyWalletSignature(address: Address, message: string, signature: Hex): Promise<boolean> {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
  });
  return publicClient.verifyMessage({ address, message, signature });
}

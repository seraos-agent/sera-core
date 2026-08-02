import { createPublicClient, formatEther, formatUnits, http, isAddress } from 'viem';
import { base, polygon, mainnet } from 'viem/chains';
import { ExecutionContext } from '../../core/execution/ExecutionContext';
import { SeraUserId } from '../../core/identity/types';
import { USDC_BASE_MAINNET } from './chains/BaseAdapter';
import { USDC_POLYGON_MAINNET } from './chains/PolygonAdapter';
import { ExecutionReceipt, WalletId } from './types';
import { WalletCustodyProvider, WalletCustodyUnavailableError } from './WalletCustodyProvider';

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

// USDC on Ethereum Mainnet
const USDC_ETHEREUM_MAINNET = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as const;

interface ThirdwebServerWalletResponse {
  result?: { address?: string };
  error?: { message?: string };
}

/**
 * SERA's first managed-custody adapter. thirdweb owns the signing material in
 * its managed vault; Core only holds the project secret in Secret Manager.
 *
 * This initial adapter intentionally supports provisioning and read-only
 * balances only. execute() remains fail-closed until Base Sepolia execution,
 * agreement enforcement, and receipt verification have been validated.
 */
export class ThirdwebCustodyProvider implements WalletCustodyProvider {
  readonly providerId = 'thirdweb';
  private readonly baseClient = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
  });
  private readonly polygonClient = createPublicClient({
    chain: polygon,
    transport: http(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'),
  });
  private readonly ethClient = createPublicClient({
    chain: mainnet,
    transport: http(process.env.ETH_RPC_URL || 'https://eth.drpc.org'),
  });
  private readonly wallets = new Map<string, WalletId>();

  constructor(private readonly secretKey = process.env.THIRDWEB_SECRET_KEY) {
    if (!secretKey?.trim()) {
      throw new WalletCustodyUnavailableError(
        'THIRDWEB_SECRET_KEY is required when SERA_WALLET_CUSTODY_PROVIDER=thirdweb.',
      );
    }
  }

  async initializeAgentWallet(userId?: SeraUserId): Promise<WalletId> {
    const identifier = `sera-agent:${userId ?? 'system'}`;
    const cached = this.wallets.get(identifier);
    if (cached) return cached;

    const response = await fetch('https://api.thirdweb.com/v1/wallets/server', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-secret-key': this.secretKey!,
      },
      body: JSON.stringify({ identifier }),
    });
    const payload = await response.json() as ThirdwebServerWalletResponse;
    const address = payload.result?.address;

    if (!response.ok || !address || !isAddress(address)) {
      throw new WalletCustodyUnavailableError(
        `thirdweb could not provision Agent Wallet: ${payload.error?.message ?? `HTTP ${response.status}`}`,
      );
    }

    const wallet = { address, network: 'Base Mainnet' };
    this.wallets.set(identifier, wallet);
    return wallet;
  }

  async getBalance(walletId: WalletId, asset: string, network?: string): Promise<number> {
    return this.getAddressBalance(walletId.address, asset, network);
  }

  async getAddressBalance(address: string, asset: string, network?: string): Promise<number> {
    if (!isAddress(address)) {
      throw new WalletCustodyUnavailableError('A valid wallet address is required to read a balance.');
    }

    const resolvedNetwork = (network || 'base-mainnet').toLowerCase();
    const assetLower = asset.trim().toLowerCase();

    // Select the correct client and USDC contract for the network
    if (resolvedNetwork === 'polygon') {
      if (assetLower === 'usdc') {
        const balance = await this.polygonClient.readContract({
          address: USDC_POLYGON_MAINNET,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });
        return Number(formatUnits(balance, 6));
      }
      if (assetLower === 'pol' || assetLower === 'matic') {
        return Number(formatEther(await this.polygonClient.getBalance({ address: address as `0x${string}` })));
      }
      return 0;
    }

    if (resolvedNetwork === 'ethereum') {
      if (assetLower === 'usdc') {
        const balance = await this.ethClient.readContract({
          address: USDC_ETHEREUM_MAINNET,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [address as `0x${string}`],
        });
        return Number(formatUnits(balance, 6));
      }
      if (assetLower === 'eth') {
        return Number(formatEther(await this.ethClient.getBalance({ address: address as `0x${string}` })));
      }
      return 0;
    }

    // Default: Base Mainnet
    if (assetLower === 'usdc') {
      const balance = await this.baseClient.readContract({
        address: USDC_BASE_MAINNET,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });
      return Number(formatUnits(balance, 6));
    }

    if (assetLower === 'eth') {
      return Number(formatEther(await this.baseClient.getBalance({ address: address as `0x${string}` })));
    }

    throw new WalletCustodyUnavailableError(`Unsupported read-only asset: ${asset}.`);
  }

  async execute(_walletId: WalletId, _context: ExecutionContext<any>): Promise<ExecutionReceipt> {
    return {
      status: 'REJECTED',
      reason: 'thirdweb execution is disabled until the Base Sepolia verification phase is complete.',
      timestamp: Date.now(),
    };
  }
}

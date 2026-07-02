import {
  createPublicClient,
  createWalletClient,
  http,
  formatEther,
  parseEther,
  formatUnits,
  parseUnits,
  encodeFunctionData,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { base } from 'viem/chains';
import { IWalletCapability } from './WalletCapability';
import { TransferReceipt, TransferRequest, WalletId } from './types';
import { SpendPermissionAdapter } from './SpendPermissionAdapter';
import { SecretManager } from '../../core/secrets/SecretManager';

const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
];

const REGISTRY_ABI = [
  {
    name: 'agentToOwner',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'agent', type: 'address' }],
    outputs: [{ type: 'address' }],
  },
  {
    name: 'registerAgent',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [],
  }
];

const VAULT_ABI = [
  {
    name: 'executeTransfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: []
  }
];

/**
 * ViemWalletAdapter — Provider-agnostic Agentic Wallet implementation.
 *
 * Architecture role: Wallet Capability (src/capabilities/wallet/)
 *
 * Key design decisions:
 * 1. Uses viem (already a project dependency) — no new deps required.
 * 2. Delegates ALL secret storage to SecretManager, which wraps an
 *    ISecretStore. Swap the store, nothing else changes here.
 * 3. Self-initializing: if no wallet exists, generates one automatically
 *    and stores it securely via SecretManager. User never sees a key.
 * 4. SpendPermissionAdapter is still present as a mandatory guard.
 *    SERA cannot spend more than what the user's spend permission allows.
 */
export class ViemWalletAdapter implements IWalletCapability {
  private secretManager: SecretManager;
  private permissionGuard: SpendPermissionAdapter;
  private walletId: WalletId | null = null;
  private publicClient: any;

  constructor(secretManager: SecretManager, permissionGuard: SpendPermissionAdapter) {
    this.secretManager = secretManager;
    this.permissionGuard = permissionGuard;

    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });
  }

  /**
   * initialize() — SERA's auto-wallet provisioning.
   *
   * Called once on server boot via GoalBridge.
   * If a wallet already exists (private key in SecretStore), loads it.
   * If not, generates a fresh EVM private key, derives the address,
   * persists both securely, and returns the WalletId.
   *
   * From the user's perspective: "Check my balance" just works.
   */
  async initialize(): Promise<WalletId> {
    let privateKey = await this.secretManager.getAgenticWalletPrivateKey();

    if (!privateKey) {
      console.log(`[ViemWalletAdapter] No Agentic Wallet found. Generating a new one...`);
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk as `0x${string}`);
      
      await this.secretManager.setAgenticWalletPrivateKey(pk);
      await this.secretManager.setAgenticWalletAddress(account.address);

      console.log(`[ViemWalletAdapter] ✅ New Agentic Wallet generated.`);
      console.log(`[ViemWalletAdapter] Address: ${account.address} (Base Mainnet)`);
      console.log(`[ViemWalletAdapter] Private key encrypted and stored in SecretStore.`);

      this.walletId = { address: account.address, network: 'base-mainnet' };
    } else {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      this.walletId = { address: account.address, network: 'base-mainnet' };
      console.log(`[ViemWalletAdapter] Existing Agentic Wallet loaded. Address: ${account.address}`);
    }

    // Attempt to register to Smart Contract if configured
    await this.registerToSmartContract();

    return this.walletId!;
  }

  async getBalance(_walletId: WalletId, _asset: string): Promise<number> {
    if (!this.walletId) throw new Error('[ViemWalletAdapter] Not initialized. Call initialize() first.');

    const asset = _asset.toLowerCase();
    
    if (asset === 'usdc') {
      const balanceUnits = await this.publicClient.readContract({
        address: USDC_BASE_MAINNET,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [this.walletId.address as `0x${string}`],
      });
      return parseFloat(formatUnits(balanceUnits as bigint, 6));
    } else {
      const balanceWei = await this.publicClient.getBalance({
        address: this.walletId.address as `0x${string}`,
      });
      return parseFloat(formatEther(balanceWei));
    }
  }

  async executeTransfer(walletId: WalletId, request: TransferRequest): Promise<TransferReceipt> {
    if (!this.walletId) throw new Error('[ViemWalletAdapter] Not initialized. Call initialize() first.');

    console.log(`[ViemWalletAdapter] 🚀 Initiating transfer of ${request.amount} ${request.asset} to ${request.recipientAddress}...`);

    // ── Mandatory Guard: SpendPermission ────────────────────────────────
    const isAllowed = await this.permissionGuard.validateAndDeduct(walletId, request);
    if (!isAllowed) {
      return {
        status: 'REJECTED',
        amountTransferred: 0,
        asset: request.asset,
        reason: 'Spend Permission Denied — transfer exceeds configured allowance.',
        timestamp: Date.now(),
      };
    }

    // ── Decrypt private key → sign → broadcast → clear from memory ──────
    const privateKey = await this.secretManager.getAgenticWalletPrivateKey();
    if (!privateKey) throw new Error('[ViemWalletAdapter] Private key not found in SecretStore.');

    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
      });

      let txHash: `0x${string}`;
      const asset = request.asset.toLowerCase();
      const vaultAddress = process.env.SERA_VAULT_ADDRESS as `0x${string}`;

      if (vaultAddress) {
        console.log(`[ViemWalletAdapter] Routing transfer through SeraVault: ${vaultAddress}`);
        const tokenAddress = asset === 'usdc' ? USDC_BASE_MAINNET : '0x0000000000000000000000000000000000000000';
        const amountWei = asset === 'usdc' ? parseUnits(request.amount.toString(), 6) : parseEther(request.amount.toString());
        
        const data = encodeFunctionData({
          abi: VAULT_ABI,
          functionName: 'executeTransfer',
          args: [tokenAddress, request.recipientAddress as `0x${string}`, amountWei],
        });
        
        // Auto-fund gas for the Vault call
        await this.ensureGas(account.address, vaultAddress, data);
        
        txHash = await walletClient.sendTransaction({
          account,
          to: vaultAddress,
          data,
        });
      } else {
        if (asset === 'usdc') {
          const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [request.recipientAddress as `0x${string}`, parseUnits(request.amount.toString(), 6)],
          });
          
          await this.ensureGas(account.address, USDC_BASE_MAINNET as `0x${string}`, data);
          
          txHash = await walletClient.sendTransaction({
            account,
            to: USDC_BASE_MAINNET,
            data,
          });
        } else {
          const value = parseEther(request.amount.toString());
          await this.ensureGas(account.address, request.recipientAddress as `0x${string}`, undefined, value);
          
          txHash = await walletClient.sendTransaction({
            account,
            to: request.recipientAddress as `0x${string}`,
            value,
          });
        }
      }

      console.log(`[ViemWalletAdapter] ⏳ Waiting for transaction confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[ViemWalletAdapter] ✅ Transfer confirmed. TX Hash: ${txHash}`);

      return {
        status: receipt.status === 'success' ? 'SUCCESS' : 'FAILED',
        transactionHash: txHash,
        amountTransferred: request.amount,
        asset: request.asset,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      console.error(`[ViemWalletAdapter] ❌ Transfer Failed: ${error.message}`);
      return {
        status: 'FAILED',
        amountTransferred: 0,
        asset: request.asset,
        reason: error.message,
        timestamp: Date.now(),
      };
    }
  }

  // ── Auto-Funding Gas Station (JIT) ──────────────────────────────────────

  private async ensureGas(agentAddress: `0x${string}`, to: `0x${string}`, data?: `0x${string}`, value?: bigint) {
    const ownerKey = process.env.OWNER_WALLET_PRIVATE_KEY;
    if (!ownerKey) {
      console.warn('[ViemWalletAdapter] ⚠️ OWNER_WALLET_PRIVATE_KEY not set in .env. Auto-fund skipped.');
      return;
    }

    try {
      const gasPrice = await this.publicClient.getGasPrice();
      let gasLimit: bigint;
      
      try {
        if (data) {
          gasLimit = await this.publicClient.estimateGas({ account: agentAddress, to, data });
        } else {
          gasLimit = await this.publicClient.estimateGas({ account: agentAddress, to, value });
        }
      } catch (estErr: any) {
        // If estimation fails (e.g., insufficient funds), use a safe fallback
        console.warn('[ViemWalletAdapter] Gas estimation failed, using fallback limits.', estErr.message);
        gasLimit = data ? 65000n : 21000n; 
      }

      // Calculate gas needed + 30% buffer (required for EIP-1559 maxFeePerGas padding)
      const gasNeeded = (gasPrice * gasLimit * 130n) / 100n;
      const agentBalance = await this.publicClient.getBalance({ address: agentAddress });

      if (agentBalance < gasNeeded) {
        const deficit = gasNeeded - agentBalance;
        console.log(`[ViemWalletAdapter] ⛽ Agent deficit: ${formatEther(deficit)} ETH. Auto-funding from Owner...`);
        
        const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`);
        const ownerClient = createWalletClient({
          account: ownerAccount,
          chain: base,
          transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
        });

        const txHash = await ownerClient.sendTransaction({
          to: agentAddress,
          value: deficit,
        });

        console.log(`[ViemWalletAdapter] ⏳ Waiting for auto-fund confirmation... (TX: ${txHash})`);
        await this.publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`[ViemWalletAdapter] ✅ Auto-fund successful.`);
      } else {
        console.log(`[ViemWalletAdapter] ⛽ Agent has enough gas for this transaction.`);
      }
    } catch (err: any) {
      console.error('[ViemWalletAdapter] Auto-fund logic error:', err.message);
    }
  }

  // ── Smart Contract Registration ─────────────────────────────────────────

  private async registerToSmartContract() {
    const registryAddress = process.env.SERA_REGISTRY_ADDRESS;
    const ownerKey = process.env.OWNER_WALLET_PRIVATE_KEY;
    if (!registryAddress || !ownerKey || !this.walletId) return;

    try {
      const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`);
      const agentAddress = this.walletId.address as `0x${string}`;

      // Check if already registered
      const registeredOwner = await this.publicClient.readContract({
        address: registryAddress as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'agentToOwner',
        args: [agentAddress],
      });

      if (registeredOwner !== '0x0000000000000000000000000000000000000000') {
        console.log(`[ViemWalletAdapter] 🔗 Agent is already registered in Mainnet Registry to Owner: ${registeredOwner}`);
        return;
      }

      console.log(`[ViemWalletAdapter] 📝 Agent not registered yet. Registering to SeraRegistry on Base Mainnet...`);

      const privateKey = await this.secretManager.getAgenticWalletPrivateKey();
      if (!privateKey) return;
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
      });

      const data = encodeFunctionData({
        abi: REGISTRY_ABI,
        functionName: 'registerAgent',
        args: [ownerAccount.address],
      });

      // Auto-fund gas for the registration!
      await this.ensureGas(account.address, registryAddress as `0x${string}`, data);

      const txHash = await walletClient.sendTransaction({
        account,
        to: registryAddress as `0x${string}`,
        data,
      });

      console.log(`[ViemWalletAdapter] ⏳ Waiting for Registry confirmation... (TX: ${txHash})`);
      await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[ViemWalletAdapter] ✅ Agent successfully registered on-chain!`);
    } catch (err: any) {
      console.error(`[ViemWalletAdapter] ❌ Failed to register agent on-chain:`, err.message);
    }
  }
}

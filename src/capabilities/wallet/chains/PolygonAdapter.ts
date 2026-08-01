import { createPublicClient, createWalletClient, http, formatEther, parseEther, formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';
import { ExecutionContext } from '../../../core/execution/ExecutionContext';
import { TransferIntentParameters } from '../../../core/intents/transfer.types';
import { ExecutionReceipt } from '../types';

export const USDC_POLYGON_MAINNET = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }
];

const VAULT_ABI = [
  { name: 'executeTransfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] }
];

export class PolygonAdapter {
  private publicClient: any;
  private vaultAddress: `0x${string}` | null;

  constructor() {
    const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';
    this.publicClient = createPublicClient({
      chain: polygon,
      transport: http(rpcUrl),
    });
    this.vaultAddress = (process.env.SERA_VAULT_ADDRESS as `0x${string}`) || null;
  }

  public async getBalance(address: `0x${string}`, assetId: string): Promise<number> {
    const asset = assetId.toLowerCase();
    if (asset === 'usdc' || asset === 'usdc.e') {
      const balanceUnits = await this.publicClient.readContract({
        address: USDC_POLYGON_MAINNET,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      return parseFloat(formatUnits(balanceUnits as bigint, 6));
    } else {
      const balanceWei = await this.publicClient.getBalance({ address });
      return parseFloat(formatEther(balanceWei)); // Returns balance in POL (formerly MATIC)
    }
  }

  public async executeTransaction(
    privateKeyHex: string, 
    context: ExecutionContext<TransferIntentParameters>
  ): Promise<ExecutionReceipt> {
    const intent = context.intent;
    const assetId = context.asset?.id.toLowerCase() || 'usdc';
    
    // Resolve exact amount
    let finalAmount = 0;
    if (intent.amount === 'all') {
      const fromWalletAddress = intent.fromWallet === 'sera_vault' && this.vaultAddress 
          ? this.vaultAddress 
          : privateKeyToAccount(privateKeyHex as `0x${string}`).address;
      finalAmount = await this.getBalance(fromWalletAddress, assetId);
      if (finalAmount <= 0) {
         throw new Error("Insufficient balance to transfer 'all'.");
      }
    } else {
      finalAmount = intent.amount;
    }

    // Resolve recipient
    const account = privateKeyToAccount(privateKeyHex as `0x${string}`);
    let recipientAddress: string = '';
    if (intent.recipient.type === 'USER_MAIN_WALLET') {
      recipientAddress = account.address;
    } else if (intent.recipient.type === 'SERA_VAULT') {
      if (!this.vaultAddress) throw new Error("SERA_VAULT_ADDRESS is not configured.");
      recipientAddress = this.vaultAddress;
    } else if (intent.recipient.type === 'EXTERNAL_ADDRESS') {
      if (!intent.recipient.address || !intent.recipient.address.startsWith('0x')) {
        throw new Error(`Invalid recipient address format: ${intent.recipient.address}`);
      }
      recipientAddress = intent.recipient.address;
    } else {
      throw new Error(`Invalid recipient type: ${intent.recipient.type}`);
    }

    console.log(`[PolygonAdapter] 🚀 Initiating transfer of ${finalAmount} ${assetId} to ${recipientAddress}...`);

    try {
      const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'),
      });

      let txHash: `0x${string}`;
      const isFundingVault = this.vaultAddress && recipientAddress.toLowerCase() === this.vaultAddress.toLowerCase();

      if (this.vaultAddress && !isFundingVault && intent.fromWallet === 'sera_vault') {
        console.log(`[PolygonAdapter] Routing transfer through SeraVault: ${this.vaultAddress}`);
        const tokenAddress = (assetId === 'usdc' || assetId === 'usdc.e') ? USDC_POLYGON_MAINNET : '0x0000000000000000000000000000000000000000';
        const amountWei = (assetId === 'usdc' || assetId === 'usdc.e') ? parseUnits(finalAmount.toString(), 6) : parseEther(finalAmount.toString());
        
        const data = encodeFunctionData({
          abi: VAULT_ABI,
          functionName: 'executeTransfer',
          args: [tokenAddress, recipientAddress as `0x${string}`, amountWei],
        });
        
        const ownerKey = process.env.OWNER_WALLET_PRIVATE_KEY;
        let executorAccount = account;
        let executorClient = walletClient;
        
        if (ownerKey) {
          console.log(`[PolygonAdapter] Using Owner Key to authorize Vault transfer...`);
          executorAccount = privateKeyToAccount(ownerKey as `0x${string}`);
          executorClient = createWalletClient({
            account: executorAccount,
            chain: polygon,
            transport: http(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'),
          });
        }
        
        await this.ensureGas(executorAccount.address, this.vaultAddress, data);
        
        txHash = await executorClient.sendTransaction({
          account: executorAccount,
          to: this.vaultAddress,
          data,
        });
      } else {
        if (assetId === 'usdc' || assetId === 'usdc.e') {
          const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [recipientAddress as `0x${string}`, parseUnits(finalAmount.toString(), 6)],
          });
          
          await this.ensureGas(account.address, USDC_POLYGON_MAINNET as `0x${string}`, data);
          
          txHash = await walletClient.sendTransaction({
            account,
            to: USDC_POLYGON_MAINNET,
            data,
          });
        } else {
          const value = parseEther(finalAmount.toString());
          await this.ensureGas(account.address, recipientAddress as `0x${string}`, undefined, value);
          
          txHash = await walletClient.sendTransaction({
            account,
            to: recipientAddress as `0x${string}`,
            value,
          });
        }
      }

      console.log(`[PolygonAdapter] ⏳ Waiting for transaction confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[PolygonAdapter] ✅ Transfer confirmed. TX Hash: ${txHash}`);

      return {
        status: receipt.status === 'success' ? 'SUCCESS' : 'FAILED',
        executionId: txHash,
        amountExecuted: finalAmount,
        asset: assetId,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      console.error(`[PolygonAdapter] ❌ Execution Failed: ${error.message}`);
      return {
        status: 'FAILED',
        amountExecuted: 0,
        asset: assetId,
        reason: error.message,
        timestamp: Date.now(),
      };
    }
  }

  private async ensureGas(agentAddress: `0x${string}`, to: `0x${string}`, data?: `0x${string}`, value?: bigint) {
    const ownerKey = process.env.OWNER_WALLET_PRIVATE_KEY;
    if (!ownerKey) {
      console.warn('[PolygonAdapter] ⚠️ OWNER_WALLET_PRIVATE_KEY not set in .env. Auto-fund skipped.');
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
        console.warn('[PolygonAdapter] Gas estimation failed, using fallback limits.', estErr.message);
        gasLimit = data ? 80000n : 21000n; 
      }

      // Buffer 30% for safety
      const gasNeeded = (gasPrice * gasLimit * 130n) / 100n;
      const agentBalance = await this.publicClient.getBalance({ address: agentAddress });

      if (agentBalance < gasNeeded) {
        const deficit = gasNeeded - agentBalance;
        console.log(`[PolygonAdapter] ⛽ Agent deficit: ${formatEther(deficit)} POL. Auto-funding from Owner...`);
        
        const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`);
        const ownerClient = createWalletClient({
          account: ownerAccount,
          chain: polygon,
          transport: http(process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com'),
        });

        const txHash = await ownerClient.sendTransaction({
          to: agentAddress,
          value: deficit,
        });

        console.log(`[PolygonAdapter] ⏳ Waiting for auto-fund confirmation... (TX: ${txHash})`);
        await this.publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`[PolygonAdapter] ✅ Auto-fund successful.`);
      }
    } catch (err: any) {
      console.error('[PolygonAdapter] Auto-fund logic error:', err.message);
    }
  }
}

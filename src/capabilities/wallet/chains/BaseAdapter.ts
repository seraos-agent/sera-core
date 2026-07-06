import { createPublicClient, createWalletClient, http, formatEther, parseEther, formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { ExecutionContext } from '../../../core/execution/ExecutionContext';
import { TransferIntentParameters } from '../../../core/intents/transfer.types';
import { ExecutionReceipt } from '../types';

export const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] }
];

const VAULT_ABI = [
  { name: 'executeTransfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] }
];

export class BaseAdapter {
  private publicClient: any;
  private vaultAddress: `0x${string}` | null;

  constructor() {
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });
    this.vaultAddress = (process.env.SERA_VAULT_ADDRESS as `0x${string}`) || null;
  }

  public async getBalance(address: `0x${string}`, assetId: string): Promise<number> {
    const asset = assetId.toLowerCase();
    if (asset === 'usdc') {
      const balanceUnits = await this.publicClient.readContract({
        address: USDC_BASE_MAINNET,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address],
      });
      return parseFloat(formatUnits(balanceUnits as bigint, 6));
    } else {
      const balanceWei = await this.publicClient.getBalance({ address });
      return parseFloat(formatEther(balanceWei));
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
      // Very naive 'all' resolution for base adapter - ideally handled by intent resolution earlier, 
      // but if it reaches here, we check balance.
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
      recipientAddress = account.address; // For now assuming the agent's account acts as the user main wallet or we should fail if we don't know the owner
      // Ideally, registry holds the owner. We will use the agent's owner if available. 
      // Actually, in the old GoalBridge, if recipient.type === 'USER_MAIN_WALLET', finalRecipient = walletId.address.
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

    console.log(`[BaseAdapter] 🚀 Initiating transfer of ${finalAmount} ${assetId} to ${recipientAddress}...`);

    try {
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
      });

      let txHash: `0x${string}`;
      const isFundingVault = this.vaultAddress && recipientAddress.toLowerCase() === this.vaultAddress.toLowerCase();
      
      // Implicit initiator checks (AI vs UI) have been removed from this layer as execution should be pure.
      // GoalBridge should validate policies before passing the ExecutionContext.

      if (this.vaultAddress && !isFundingVault && intent.fromWallet === 'sera_vault') {
        console.log(`[BaseAdapter] Routing transfer through SeraVault: ${this.vaultAddress}`);
        const tokenAddress = assetId === 'usdc' ? USDC_BASE_MAINNET : '0x0000000000000000000000000000000000000000';
        const amountWei = assetId === 'usdc' ? parseUnits(finalAmount.toString(), 6) : parseEther(finalAmount.toString());
        
        const data = encodeFunctionData({
          abi: VAULT_ABI,
          functionName: 'executeTransfer',
          args: [tokenAddress, recipientAddress as `0x${string}`, amountWei],
        });
        
        await this.ensureGas(account.address, this.vaultAddress, data);
        
        txHash = await walletClient.sendTransaction({
          account,
          to: this.vaultAddress,
          data,
        });
      } else {
        if (assetId === 'usdc') {
          const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: 'transfer',
            args: [recipientAddress as `0x${string}`, parseUnits(finalAmount.toString(), 6)],
          });
          
          await this.ensureGas(account.address, USDC_BASE_MAINNET as `0x${string}`, data);
          
          txHash = await walletClient.sendTransaction({
            account,
            to: USDC_BASE_MAINNET,
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

      console.log(`[BaseAdapter] ⏳ Waiting for transaction confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log(`[BaseAdapter] ✅ Transfer confirmed. TX Hash: ${txHash}`);

      return {
        status: receipt.status === 'success' ? 'SUCCESS' : 'FAILED',
        executionId: txHash,
        amountExecuted: finalAmount,
        asset: assetId,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      console.error(`[BaseAdapter] ❌ Execution Failed: ${error.message}`);
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
      console.warn('[BaseAdapter] ⚠️ OWNER_WALLET_PRIVATE_KEY not set in .env. Auto-fund skipped.');
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
        console.warn('[BaseAdapter] Gas estimation failed, using fallback limits.', estErr.message);
        gasLimit = data ? 65000n : 21000n; 
      }

      const gasNeeded = (gasPrice * gasLimit * 130n) / 100n;
      const agentBalance = await this.publicClient.getBalance({ address: agentAddress });

      if (agentBalance < gasNeeded) {
        const deficit = gasNeeded - agentBalance;
        console.log(`[BaseAdapter] ⛽ Agent deficit: ${formatEther(deficit)} ETH. Auto-funding from Owner...`);
        
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

        console.log(`[BaseAdapter] ⏳ Waiting for auto-fund confirmation... (TX: ${txHash})`);
        await this.publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`[BaseAdapter] ✅ Auto-fund successful.`);
      }
    } catch (err: any) {
      console.error('[BaseAdapter] Auto-fund logic error:', err.message);
    }
  }
}

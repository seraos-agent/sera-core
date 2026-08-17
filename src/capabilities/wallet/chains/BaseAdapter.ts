import { createPublicClient, createWalletClient, http, formatEther, parseEther, formatUnits, parseUnits, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import { Attribution } from 'ox/erc8021';
import { ExecutionContext } from '../../../core/execution/ExecutionContext';
import { TransferIntentParameters } from '../../../core/intents/transfer.types';
import { ExecutionReceipt } from '../types';

export const USDC_BASE_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  {
    name: 'transferWithAuthorization',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
      { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' },
      { name: 's', type: 'bytes32' }
    ],
    outputs: []
  }
];

const VAULT_ABI = [
  { name: 'executeTransfer', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'token', type: 'address' }, { name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [] }
];

export class BaseAdapter {
  private publicClient: any;
  private vaultAddress: `0x${string}` | null;
  private builderDataSuffix?: `0x${string}`;

  constructor() {
    const rpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    });
    this.vaultAddress = (process.env.SERA_VAULT_ADDRESS as `0x${string}`) || null;

    const builderCode = process.env.BASE_BUILDER_CODE;
    if (builderCode) {
      this.builderDataSuffix = Attribution.toDataSuffix({ codes: [builderCode] }) as `0x${string}`;
    }
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

  public async executeGaslessDeposit(payload: {
    from: string;
    to: string;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: string;
    signature?: string;
    v?: number;
    r?: string;
    s?: string;
  }): Promise<{ status: 'SUCCESS' | 'FAILED'; transactionHash?: string; error?: string }> {
    const ownerKey = process.env.OWNER_WALLET_PRIVATE_KEY;
    if (!ownerKey) {
      throw new Error('OWNER_WALLET_PRIVATE_KEY is not configured for gas relayer.');
    }

    let v = payload.v;
    let r = payload.r as `0x${string}` | undefined;
    let s = payload.s as `0x${string}` | undefined;

    if (payload.signature && (!v || !r || !s)) {
      const cleanSig = payload.signature.startsWith('0x') ? payload.signature.slice(2) : payload.signature;
      r = `0x${cleanSig.slice(0, 64)}` as `0x${string}`;
      s = `0x${cleanSig.slice(64, 128)}` as `0x${string}`;
      let rawV = parseInt(cleanSig.slice(128, 130), 16);
      if (rawV < 27) rawV += 27;
      v = rawV;
    }

    if (!v || !r || !s) {
      throw new Error('Invalid signature format for EIP-3009 transfer.');
    }

    const relayerAccount = privateKeyToAccount(ownerKey as `0x${string}`);
    const relayerClient = createWalletClient({
      account: relayerAccount,
      chain: base,
      transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
    });

    const data = encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transferWithAuthorization',
      args: [
        payload.from as `0x${string}`,
        payload.to as `0x${string}`,
        BigInt(payload.value),
        BigInt(payload.validAfter),
        BigInt(payload.validBefore),
        payload.nonce as `0x${string}`,
        v,
        r,
        s,
      ],
    });

    console.log(`[BaseAdapter] 🚀 Relaying gasless USDC deposit: ${payload.value} units from ${payload.from} to ${payload.to}`);

    const txHash = await relayerClient.sendTransaction({
      account: relayerAccount,
      to: USDC_BASE_MAINNET,
      data,
      ...(this.builderDataSuffix ? { dataSuffix: this.builderDataSuffix } : {}),
    });

    console.log(`[BaseAdapter] ⏳ Waiting for gasless deposit receipt (TX: ${txHash})...`);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== 'success') {
      return { status: 'FAILED', error: 'Gasless deposit transaction reverted on-chain.', transactionHash: txHash };
    }

    console.log(`[BaseAdapter] ✅ Gasless deposit confirmed on Base!`);
    return { status: 'SUCCESS', transactionHash: txHash };
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

    console.log(`[BaseAdapter] 🚀 Initiating transfer of ${finalAmount} ${assetId} to ${recipientAddress}...`);

    try {
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
      });

      let txHash: `0x${string}`;

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
          ...(this.builderDataSuffix ? { dataSuffix: this.builderDataSuffix } : {}),
        });
      } else {
        const value = parseEther(finalAmount.toString());
        await this.ensureGas(account.address, recipientAddress as `0x${string}`, undefined, value);

        txHash = await walletClient.sendTransaction({
          account,
          to: recipientAddress as `0x${string}`,
          value,
          ...(this.builderDataSuffix ? { dataSuffix: this.builderDataSuffix } : {}),
        });
      }

      try {
        await context.onBroadcast?.(txHash);
      } catch (error: any) {
        console.error(`[BaseAdapter] Failed to record transaction broadcast: ${error.message}`);
      }

      console.log(`[BaseAdapter] ⏳ Waiting for transaction receipt... (TX: ${txHash})`);
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
          ...(this.builderDataSuffix ? { dataSuffix: this.builderDataSuffix } : {}),
        });

        console.log(`[BaseAdapter] ⏳ Waiting for auto-fund confirmation... (TX: ${txHash})`);
        await this.publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`[BaseAdapter] ✅ Auto-fund successful.`);
      }
    } catch (err: any) {
      console.error('[BaseAdapter] Auto-fund logic error:', err.message);
    }
  }

  public async ensureAddressGas(targetAddress: `0x${string}`): Promise<boolean> {
    const ownerKey = process.env.OWNER_WALLET_PRIVATE_KEY;
    if (!ownerKey) return false;

    try {
      const balance = await this.publicClient.getBalance({ address: targetAddress });
      const minRequired = parseEther('0.00004');
      if (balance < minRequired) {
        const topUp = parseEther('0.00006');
        console.log(`[BaseAdapter] ⛽ Sponsoring user personal wallet gas: ${formatEther(topUp)} ETH to ${targetAddress}`);

        const ownerAccount = privateKeyToAccount(ownerKey as `0x${string}`);
        const ownerClient = createWalletClient({
          account: ownerAccount,
          chain: base,
          transport: http(process.env.BASE_RPC_URL || 'https://mainnet.base.org'),
        });

        const txHash = await ownerClient.sendTransaction({
          to: targetAddress,
          value: topUp,
          ...(this.builderDataSuffix ? { dataSuffix: this.builderDataSuffix } : {}),
        });

        await this.publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log(`[BaseAdapter] ✅ User personal wallet gas sponsored successfully: ${txHash}`);
        return true;
      }
      return true;
    } catch (err: any) {
      console.warn('[BaseAdapter] Failed to sponsor user personal gas:', err.message);
      return false;
    }
  }
}

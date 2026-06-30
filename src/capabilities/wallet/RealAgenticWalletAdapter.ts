import { IWalletCapability } from './WalletCapability';
import { TransferReceipt, TransferRequest, WalletId } from './types';
import { SpendPermissionAdapter } from './SpendPermissionAdapter';
import { Coinbase, Wallet } from '@coinbase/cdp-sdk';
import * as fs from 'fs';
import * as path from 'path';

export class RealAgenticWalletAdapter implements IWalletCapability {
  private permissionGuard: SpendPermissionAdapter;
  private wallet!: Wallet;
  private seedPath: string;

  constructor(permissionGuard: SpendPermissionAdapter) {
    this.permissionGuard = permissionGuard;
    const projectRoot = process.cwd();
    this.seedPath = path.join(projectRoot, '.data', 'cdp_wallet_seed.json');
  }

  async initialize(): Promise<WalletId> {
    const apiKeyId = process.env.CDP_API_KEY_ID;
    const apiKeySecret = process.env.CDP_API_KEY_SECRET;

    if (!apiKeyId || !apiKeySecret) {
      throw new Error('[RealAgenticWalletAdapter] Missing CDP_API_KEY_ID or CDP_API_KEY_SECRET in environment variables.');
    }

    // Configure Coinbase SDK v2
    Coinbase.configure({ apiKeyName: apiKeyId, privateKey: apiKeySecret });

    // Load or create wallet
    let walletIdStr: string;
    let seedStr: string | undefined;

    if (fs.existsSync(this.seedPath)) {
      const data = JSON.parse(fs.readFileSync(this.seedPath, 'utf8'));
      walletIdStr = data.walletId;
      seedStr = data.seed;
      console.log(`[RealAgenticWalletAdapter] Loading existing Agentic Wallet ID: ${walletIdStr}`);
      this.wallet = await Wallet.fetch(walletIdStr);
    } else {
      console.log(`[RealAgenticWalletAdapter] Creating new Agentic Wallet on Base Sepolia...`);
      this.wallet = await Wallet.create({ networkId: Coinbase.networks.BaseSepolia });
      walletIdStr = this.wallet.getId();
      console.log(`[RealAgenticWalletAdapter] Created Wallet ID: ${walletIdStr}`);
      
      const seed = this.wallet.export();
      
      const dir = path.dirname(this.seedPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.seedPath, JSON.stringify({ walletId: walletIdStr, seed }), 'utf8');
      console.log(`[RealAgenticWalletAdapter] Wallet seed saved to ${this.seedPath}`);
    }

    const defaultAddress = await this.wallet.getDefaultAddress();
    return {
      address: defaultAddress.getId(),
      network: 'base-sepolia'
    };
  }

  async getBalance(walletId: WalletId, asset: string): Promise<number> {
    // In CDP SDK v2, wallet.balances() returns a Map of asset names to balances
    if (!this.wallet) {
        throw new Error('Wallet not initialized. Call initialize() first.');
    }
    const balances = await this.wallet.balances();
    const balance = balances.get(asset.toLowerCase()) || 0;
    return Number(balance);
  }

  async executeTransfer(walletId: WalletId, request: TransferRequest): Promise<TransferReceipt> {
    console.log(`[RealAgenticWalletAdapter] 🚀 Initiating transfer of ${request.amount} ${request.asset} to ${request.recipientAddress}...`);
    
    // Step 1: The Guard
    const isAllowed = await this.permissionGuard.validateAndDeduct(walletId, request);
    
    if (!isAllowed) {
      return {
        status: 'REJECTED',
        amountTransferred: 0,
        asset: request.asset,
        reason: 'Spend Permission Denied',
        timestamp: Date.now()
      };
    }

    // Step 2: The Real Execution
    try {
      const transfer = await this.wallet.createTransfer({
        amount: request.amount,
        assetId: request.asset.toLowerCase(),
        destination: request.recipientAddress
      });

      console.log(`[RealAgenticWalletAdapter] ⏳ Waiting for transfer to complete on-chain...`);
      await transfer.wait();

      const txHash = transfer.getTransactionHash() || '0xunknown';
      console.log(`[RealAgenticWalletAdapter] ✅ Transfer executed successfully. TX Hash: ${txHash}`);

      return {
        status: 'SUCCESS',
        transactionHash: txHash,
        amountTransferred: request.amount,
        asset: request.asset,
        timestamp: Date.now()
      };
    } catch (error: any) {
      console.error(`[RealAgenticWalletAdapter] ❌ Transfer Failed: ${error.message}`);
      return {
        status: 'FAILED',
        amountTransferred: 0,
        asset: request.asset,
        reason: error.message,
        timestamp: Date.now()
      };
    }
  }
}

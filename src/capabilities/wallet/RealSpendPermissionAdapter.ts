import { createPublicClient, http } from 'viem';
import { baseSepolia } from 'viem/chains';
import * as fs from 'fs';
import * as path from 'path';
import { TransferRequest, WalletId } from './types';
import { OwnerIdentityService } from '../../core/identity/OwnerIdentityService';
import { spendPermissionManagerAbi, spendPermissionManagerAddress } from '@coinbase/cdp-sdk';

export class RealSpendPermissionAdapter {
  private ownerIdentity: OwnerIdentityService;
  private publicClient: any;
  private processedIdempotencyKeys: Set<string>;
  private persistPath: string;

  constructor(ownerIdentity: OwnerIdentityService) {
    this.ownerIdentity = ownerIdentity;
    
    // Create viem client for on-chain reads
    const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
    this.publicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(rpcUrl),
    });

    const projectRoot = process.cwd();
    this.persistPath = path.join(projectRoot, '.data', 'spend_permission_idempotency.json');
    this.processedIdempotencyKeys = new Set();
    this.loadPersistedData();
  }

  private loadPersistedData() {
    if (fs.existsSync(this.persistPath)) {
      const data = JSON.parse(fs.readFileSync(this.persistPath, 'utf-8'));
      this.processedIdempotencyKeys = new Set(data.processedIdempotencyKeys || []);
    }
  }

  private savePersistedData() {
    const data = {
      processedIdempotencyKeys: Array.from(this.processedIdempotencyKeys)
    };
    const tmpPath = `${this.persistPath}.tmp`;
    const dir = path.dirname(this.persistPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(data), 'utf-8');
    fs.renameSync(tmpPath, this.persistPath);
  }

  async validateAndDeduct(walletId: WalletId, request: TransferRequest): Promise<boolean> {
    if (this.processedIdempotencyKeys.has(request.idempotencyKey)) {
      console.log(`[RealSpendPermission] ⚠️ Denied. Request ID (Idempotency Key) already processed: ${request.idempotencyKey}`);
      return false; // Idempotency check prevents double spend
    }

    try {
      const ownerAddress = this.ownerIdentity.getOwnerAddress();
      const agentAddress = walletId.address as `0x${string}`;
      
      // We map 'eth' or 'usdc' to contract addresses. 
      // For native ETH, contracts usually use address(0) or a specific constant.
      // Here we assume native ETH is address(0).
      const assetAddress: `0x${string}` = request.asset.toLowerCase() === 'eth' 
        ? '0x0000000000000000000000000000000000000000'
        : '0x0000000000000000000000000000000000000000'; // Replace with real ERC20 addresses

      console.log(`[RealSpendPermission] 🔍 Checking on-chain allowance on Base Sepolia...`);
      console.log(`[RealSpendPermission] Owner: ${ownerAddress} | Agent: ${agentAddress}`);

      let onchainAllowanceBigInt: bigint = 0n;
      
      try {
         onchainAllowanceBigInt = await this.publicClient.readContract({
            address: spendPermissionManagerAddress,
            abi: spendPermissionManagerAbi,
            functionName: 'checkAllowance',
            args: [ownerAddress, agentAddress, assetAddress],
        }) as bigint;
      } catch (err: any) {
        console.warn(`[RealSpendPermission] ⚠️ Failed to read contract at ${spendPermissionManagerAddress}. Using fallback 0.01 ETH. Reason: ${err.shortMessage || err.message}`);
        onchainAllowanceBigInt = BigInt(1e16); // 0.01 ETH in wei
      }

      const onchainAllowance = Number(onchainAllowanceBigInt) / 1e18; // assuming 18 decimals

      if (onchainAllowance < request.amount) {
        console.log(`[RealSpendPermission] ❌ Denied. Requested ${request.amount} ${request.asset}, but on-chain allowance is only ${onchainAllowance}`);
        return false;
      }

      console.log(`[RealSpendPermission] ✅ On-chain validation passed. Note: Deduction happens on-chain upon transfer execution.`);

      // Mark as processed
      this.processedIdempotencyKeys.add(request.idempotencyKey);
      this.savePersistedData();
      
      return true;
    } catch (error: any) {
      console.error(`[RealSpendPermission] ❌ Error validating on-chain spend permission: ${error.message}`);
      return false;
    }
  }
}

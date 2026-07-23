import { createPublicClient, http, parseAbiItem, formatUnits } from 'viem';
import { base } from 'viem/chains';
import { SubscriptionService } from './SubscriptionService';

export interface TreasuryDepositWatcherConfig {
  treasuryAddress?: string;
  usdcContractAddress?: string;
  rpcUrl?: string;
  pollIntervalMs?: number;
}

const DEFAULT_BASE_USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base Mainnet
const DEFAULT_TREASURY_ADDRESS = process.env.SERA_TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000';

export class TreasuryDepositWatcher {
  private isRunning = false;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private lastProcessedBlock: bigint = 0n;
  private treasuryAddress: string;
  private usdcContractAddress: string;
  private client: any;

  constructor(
    private subscriptionService: SubscriptionService,
    config: TreasuryDepositWatcherConfig = {}
  ) {
    this.treasuryAddress = (config.treasuryAddress || DEFAULT_TREASURY_ADDRESS).toLowerCase();
    this.usdcContractAddress = (config.usdcContractAddress || DEFAULT_BASE_USDC_CONTRACT).toLowerCase();
    
    const rpcUrl = config.rpcUrl || process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    this.client = createPublicClient({
      chain: base,
      transport: http(rpcUrl)
    });
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    if (this.treasuryAddress === '0x0000000000000000000000000000000000000000') {
      console.warn('[TreasuryDepositWatcher] SERA_TREASURY_ADDRESS not set — running in polling standby mode.');
    }

    this.isRunning = true;
    try {
      this.lastProcessedBlock = await this.client.getBlockNumber();
    } catch {
      this.lastProcessedBlock = 0n;
    }

    console.log(`[TreasuryDepositWatcher] Started watching deposits for Treasury ${this.treasuryAddress} on Base.`);
    this.timerHandle = setInterval(() => void this.pollDepositLogs(), 15000);
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    console.log('[TreasuryDepositWatcher] Stopped.');
  }

  public async pollDepositLogs(): Promise<void> {
    if (!this.isRunning || this.treasuryAddress === '0x0000000000000000000000000000000000000000') return;

    try {
      const latestBlock = await this.client.getBlockNumber();
      if (latestBlock <= this.lastProcessedBlock) return;

      const fromBlock = this.lastProcessedBlock + 1n;
      const logs = await this.client.getLogs({
        address: this.usdcContractAddress as `0x${string}`,
        event: parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)'),
        args: {
          to: this.treasuryAddress as `0x${string}`
        },
        fromBlock,
        toBlock: latestBlock
      });

      for (const log of logs) {
        const sender = log.args.from?.toLowerCase();
        const rawValue = log.args.value;
        if (sender && rawValue) {
          const usdcAmount = parseFloat(formatUnits(rawValue, 6)); // USDC has 6 decimals
          console.log(`[TreasuryDepositWatcher] Detected USDC deposit: ${usdcAmount} USDC from ${sender}`);
          try {
            const credits = this.subscriptionService.recordTopUp(sender, usdcAmount);
            console.log(`[TreasuryDepositWatcher] Successfully credited ${sender} — Total Agent Credits: ${credits}`);
          } catch (e: any) {
            console.warn(`[TreasuryDepositWatcher] TopUp skipped for ${sender}: ${e.message}`);
          }
        }
      }

      this.lastProcessedBlock = latestBlock;
    } catch (error) {
      console.error('[TreasuryDepositWatcher] Error polling deposit logs:', error);
    }
  }

  /** Direct manual trigger for testing / webhooks */
  public processDeposit(senderAddress: string, amountUsdc: number): number {
    return this.subscriptionService.recordTopUp(senderAddress, amountUsdc);
  }
}

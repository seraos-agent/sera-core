import { BountyLedger } from './BountyLedger';
import { SubscriptionService } from './SubscriptionService';

/**
 * Constants for point rewards
 */
export const POINTS_DAILY_CHECKIN = 500;
export const POINTS_X_ENGAGEMENT = 1000;
export const POINTS_WATCH_EARN = 2000;

export const EXCHANGE_RATE_POINTS_TO_CREDITS = 100; // 1 Point = 100 Agent Credits

export class BountyManagerService {
  private ledger: BountyLedger;
  private subscriptionService: SubscriptionService;

  constructor(subscriptionService: SubscriptionService, ledger: BountyLedger = new BountyLedger()) {
    this.ledger = ledger;
    this.subscriptionService = subscriptionService;
  }

  /**
   * Fetch current points for a user
   */
  public getPoints(userAddress: string): number {
    return this.ledger.getPoints(userAddress);
  }

  /**
   * Process daily check-in claim
   */
  public claimDailyCheckIn(userAddress: string): boolean {
    if (this.ledger.canClaimDaily(userAddress)) {
      this.ledger.addPoints(userAddress, POINTS_DAILY_CHECKIN);
      this.ledger.markDailyClaimed(userAddress);
      return true;
    }
    return false; // Already claimed today
  }

  /**
   * Process event-based quest claim
   * In a real environment, this would verify via Supabase/OAuth
   */
  public claimEventQuest(userAddress: string, questId: string): boolean {
    if (this.ledger.isQuestCompleted(userAddress, questId)) {
      return false; // Already completed
    }

    let pointsAwarded = 0;
    if (questId === 'x-engagement') {
      pointsAwarded = POINTS_X_ENGAGEMENT;
    } else if (questId === 'watch-and-earn') {
      pointsAwarded = POINTS_WATCH_EARN;
    } else {
      throw new Error('Unknown quest ID');
    }

    this.ledger.addPoints(userAddress, pointsAwarded);
    this.ledger.markQuestCompleted(userAddress, questId);
    return true;
  }

  /**
   * Converts Sera points to Agent Credits
   * Minimum points to convert: e.g. 500
   */
  public convertPointsToCredits(userAddress: string, pointsAmount: number): number {
    if (pointsAmount <= 0) {
      throw new Error('Invalid points amount');
    }

    const hasBalance = this.ledger.deductPoints(userAddress, pointsAmount);
    if (!hasBalance) {
      throw new Error('Insufficient points balance');
    }

    const creditsToAdd = pointsAmount * EXCHANGE_RATE_POINTS_TO_CREDITS;
    
    // Using recordTopUp or add directly? recordTopUp takes USDC.
    // We need a way to directly add credits via SubscriptionService.
    this.subscriptionService.addCreditsDirectly(userAddress, creditsToAdd);

    return creditsToAdd;
  }
}

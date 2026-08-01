import { describe, it, expect, beforeEach } from 'vitest';
import { BountyManagerService, POINTS_DAILY_CHECKIN, POINTS_X_ENGAGEMENT, EXCHANGE_RATE_POINTS_TO_CREDITS } from '../src/server/billing/BountyManagerService';
import { BountyLedger } from '../src/server/billing/BountyLedger';
import { SubscriptionService } from '../src/server/billing/SubscriptionService';
import { SubscriptionLedger } from '../src/server/billing/SubscriptionLedger';

describe('BountyManagerService', () => {
  let bountyManager: BountyManagerService;
  let subscriptionService: SubscriptionService;
  let subscriptionLedger: SubscriptionLedger;

  beforeEach(() => {
    subscriptionLedger = new SubscriptionLedger();
    subscriptionService = new SubscriptionService(subscriptionLedger);
    bountyManager = new BountyManagerService(subscriptionService, new BountyLedger());
  });

  it('allows a user to claim a daily check-in once per day', () => {
    const userAddress = '0xDailyUser';
    
    // First claim should succeed
    const success1 = bountyManager.claimDailyCheckIn(userAddress);
    expect(success1).toBe(true);
    expect(bountyManager.getPoints(userAddress)).toBe(POINTS_DAILY_CHECKIN);

    // Second claim on the same day should fail
    const success2 = bountyManager.claimDailyCheckIn(userAddress);
    expect(success2).toBe(false);
    expect(bountyManager.getPoints(userAddress)).toBe(POINTS_DAILY_CHECKIN);
  });

  it('allows a user to complete an event quest and receive points', () => {
    const userAddress = '0xEventUser';
    
    // Complete X engagement
    const success = bountyManager.claimEventQuest(userAddress, 'x-engagement');
    expect(success).toBe(true);
    expect(bountyManager.getPoints(userAddress)).toBe(POINTS_X_ENGAGEMENT);

    // Cannot complete the same quest twice
    const success2 = bountyManager.claimEventQuest(userAddress, 'x-engagement');
    expect(success2).toBe(false);
    expect(bountyManager.getPoints(userAddress)).toBe(POINTS_X_ENGAGEMENT);
  });

  it('converts Sera points to Agent Credits properly', () => {
    const userAddress = '0xExchangeUser';
    
    // Earn some points
    bountyManager.claimDailyCheckIn(userAddress); // +500
    bountyManager.claimEventQuest(userAddress, 'x-engagement'); // +1000
    expect(bountyManager.getPoints(userAddress)).toBe(1500);

    // Convert 1000 points
    const creditsGenerated = bountyManager.convertPointsToCredits(userAddress, 1000);
    
    // Assert points deducted
    expect(bountyManager.getPoints(userAddress)).toBe(500);
    
    // Assert correct Agent Credits generated
    const expectedCredits = 1000 * EXCHANGE_RATE_POINTS_TO_CREDITS;
    expect(creditsGenerated).toBe(expectedCredits);

    // Assert SubscriptionService received the credits
    expect(subscriptionService.getAgentCredits(userAddress)).toBe(expectedCredits);
    expect(subscriptionService.hasActiveEntitlement(userAddress)).toBe(true);
  });

  it('prevents conversion if points are insufficient', () => {
    const userAddress = '0xPoorUser';
    bountyManager.claimDailyCheckIn(userAddress); // +500 points
    
    expect(() => {
      bountyManager.convertPointsToCredits(userAddress, 1000);
    }).toThrowError(/Insufficient points balance/);
    
    // Balance should remain unchanged
    expect(bountyManager.getPoints(userAddress)).toBe(500);
    expect(subscriptionService.getAgentCredits(userAddress)).toBe(0);
  });
});

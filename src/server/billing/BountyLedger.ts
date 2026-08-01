/**
 * BountyLedger manages the off-chain points (Sera Points) earned by users
 * through daily checks or event-based quests (like social auth tasks).
 */
export class BountyLedger {
  private pointsMap: Map<string, number> = new Map();
  // To track which quests a user has completed
  private completedQuests: Map<string, Set<string>> = new Map();
  // For daily quests: track the last daily check-in date string (YYYY-MM-DD)
  private lastDailyCheckIn: Map<string, string> = new Map();

  /**
   * Returns current points balance
   */
  public getPoints(userAddress: string): number {
    return this.pointsMap.get(userAddress) || 0;
  }

  /**
   * Adds points to a user's balance
   */
  public addPoints(userAddress: string, points: number): void {
    const current = this.getPoints(userAddress);
    this.pointsMap.set(userAddress, current + points);
  }

  /**
   * Deducts points (e.g. during conversion to Agent Credits). 
   * Returns true if successful, false if insufficient balance.
   */
  public deductPoints(userAddress: string, points: number): boolean {
    const current = this.getPoints(userAddress);
    if (current < points) return false;
    this.pointsMap.set(userAddress, current - points);
    return true;
  }

  /**
   * Marks a one-time event quest as completed
   */
  public markQuestCompleted(userAddress: string, questId: string): void {
    let completed = this.completedQuests.get(userAddress);
    if (!completed) {
      completed = new Set<string>();
      this.completedQuests.set(userAddress, completed);
    }
    completed.add(questId);
  }

  /**
   * Checks if an event quest has already been completed
   */
  public isQuestCompleted(userAddress: string, questId: string): boolean {
    return this.completedQuests.get(userAddress)?.has(questId) || false;
  }

  /**
   * Checks if user is eligible for daily check-in today
   */
  public canClaimDaily(userAddress: string): boolean {
    const today = new Date().toISOString().split('T')[0];
    return this.lastDailyCheckIn.get(userAddress) !== today;
  }

  /**
   * Marks daily check-in as claimed for today
   */
  public markDailyClaimed(userAddress: string): void {
    const today = new Date().toISOString().split('T')[0];
    this.lastDailyCheckIn.set(userAddress, today);
  }
}

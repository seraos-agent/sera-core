import { Intent, IntentStatus } from './types';

export class IntentStore {
  private stores: Map<string, Map<string, Intent>> = new Map();
  private activeContext: string = 'dev';

  constructor() {
    this.stores.set(this.activeContext, new Map());
  }

  public switchUser(userAddress?: string): void {
    const contextId = userAddress ? userAddress.toLowerCase() : 'dev';
    if (!this.stores.has(contextId)) {
      this.stores.set(contextId, new Map());
    }
    this.activeContext = contextId;
    console.log(`[IntentStore] Switched context to ${contextId}`);
  }

  private get intents(): Map<string, Intent> {
    return this.stores.get(this.activeContext)!;
  }

  registerIntent(intent: Intent): void {
    if (this.intents.has(intent.id)) {
      throw new Error(`Intent with id ${intent.id} is already registered.`);
    }
    this.intents.set(intent.id, intent);
    console.log(`[IntentStore] Registered new Intent: ${intent.id} (${intent.terminality})`);
  }

  getIntent(intentId: string): Intent | undefined {
    return this.intents.get(intentId);
  }

  getAllActiveIntents(): Intent[] {
    return Array.from(this.intents.values()).filter(i => i.status === 'ALIVE');
  }

  updateStatus(intentId: string, status: IntentStatus): void {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`Intent with id ${intentId} not found.`);
    }
    intent.status = status;
    console.log(`[IntentStore] Intent ${intent.id} status updated to ${status}`);
  }
}

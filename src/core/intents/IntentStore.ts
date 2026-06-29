import { Intent, IntentStatus } from './types';

export class IntentStore {
  private intents: Map<string, Intent> = new Map();

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

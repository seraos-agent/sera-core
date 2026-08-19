import { SecretManager } from '../secrets/SecretManager';

/**
 * ConnectorActivationStore
 *
 * Persists the set of connector IDs that the user has explicitly activated.
 * Connectors marked `alwaysActive` in their definition are not tracked here;
 * they are always considered active by the CapabilityCatalog.
 *
 * Storage: SecretManager (Supabase) via `ACTIVATIONS_${sessionId}`
 */
export class ConnectorActivationStore {
  private activatedIds: Set<string> = new Set();
  private loadPromise: Promise<void> | null = null;
  private secretKey: string;

  constructor(
    private secretManager: SecretManager | null = null,
    sessionId: string = 'default'
  ) {
    this.secretKey = `ACTIVATIONS_${sessionId}`;
    this.loadPromise = this.loadAsync();
  }

  /**
   * Ensures the activations have been successfully loaded from persistent storage.
   */
  public async waitForLoad(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  /** Mark a connector as activated by the user. */
  public activate(connectorId: string): void {
    this.activatedIds.add(connectorId);
    this.saveAsync();
    console.log(`[ConnectorActivationStore] Activated connector: ${connectorId}`);
  }

  /** Remove a connector from the activated set. */
  public deactivate(connectorId: string): void {
    this.activatedIds.delete(connectorId);
    this.saveAsync();
    console.log(`[ConnectorActivationStore] Deactivated connector: ${connectorId}`);
  }

  /** Check if a connector has been activated by the user. */
  public isActive(connectorId: string): boolean {
    return this.activatedIds.has(connectorId);
  }

  /** Return all activated connector IDs. */
  public getActiveIds(): string[] {
    return [...this.activatedIds];
  }

  private async saveAsync(): Promise<void> {
    if (!this.secretManager) return;
    try {
      await this.secretManager.setSecret(
        this.secretKey,
        JSON.stringify([...this.activatedIds])
      );
    } catch (error) {
      console.error('[ConnectorActivationStore] Failed to persist activations:', error);
    }
  }

  private async loadAsync(): Promise<void> {
    if (!this.secretManager) return;
    try {
      const raw = await this.secretManager.getSecret(this.secretKey);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) {
          this.activatedIds = new Set(data);
          console.log(`[ConnectorActivationStore] Loaded ${this.activatedIds.size} activated connector(s) for ${this.secretKey}.`);
        }
      }
    } catch (error) {
      console.error('[ConnectorActivationStore] Failed to load activations:', error);
    }
  }
}

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * ConnectorActivationStore
 *
 * Persists the set of connector IDs that the user has explicitly activated.
 * Connectors marked `alwaysActive` in their definition are not tracked here;
 * they are always considered active by the CapabilityCatalog.
 *
 * Storage: `.data/connector_activations.json`
 * Format:  { "activatedIds": ["sera-arena", "threads"] }
 */
export class ConnectorActivationStore {
  private activatedIds: Set<string> = new Set();
  private readonly filePath: string;

  constructor(private readonly persistLocally: boolean = true) {
    this.filePath = path.join(process.cwd(), '.data', 'connector_activations.json');
    if (this.persistLocally) {
      this.load();
    }
  }

  /** Mark a connector as activated by the user. */
  public activate(connectorId: string): void {
    this.activatedIds.add(connectorId);
    this.save();
    console.log(`[ConnectorActivationStore] Activated connector: ${connectorId}`);
  }

  /** Remove a connector from the activated set. */
  public deactivate(connectorId: string): void {
    this.activatedIds.delete(connectorId);
    this.save();
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

  private save(): void {
    if (!this.persistLocally) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.filePath,
        JSON.stringify({ activatedIds: [...this.activatedIds] }, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[ConnectorActivationStore] Failed to persist activations:', error);
    }
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.activatedIds)) {
          this.activatedIds = new Set(data.activatedIds);
          console.log(`[ConnectorActivationStore] Loaded ${this.activatedIds.size} activated connector(s).`);
        }
      }
    } catch (error) {
      console.error('[ConnectorActivationStore] Failed to load activations:', error);
    }
  }
}

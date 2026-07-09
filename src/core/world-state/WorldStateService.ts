import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../events/types';
import { Observation, WorldStateSnapshot, WalletState, TemporalState } from './types';

export class WorldStateService {
  private state: WorldStateSnapshot;
  private processedObservationIds: Set<string>;
  private persistPath: string;
  private eventBus: EventEmitter;

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.state = {
      lastUpdatedAt: Date.now(),
      wallet: null,
      temporal: null,
      communication: null
    };
    
    const projectRoot = process.cwd();
    this.persistPath = path.join(projectRoot, '.data', 'world_state.json');
    this.processedObservationIds = new Set<string>();
    
    this.loadPersistedData();
    this.subscribeToReality();
  }

  private subscribeToReality() {
    this.eventBus.on(EventTypes.DOMAIN_WALLET_STATE, (event: StandardEvent) => {
      const p = event.payload as any;
      this.state.wallet = {
        address: p.address,
        vaultAddress: p.vaultAddress,
        balance: parseFloat(p.balance) || 0,
        vaultBalance: parseFloat(p.vaultBalance) || 0,
        network: p.network || 'unknown',
        asset: p.asset || 'USDC',
        quality: {
          updatedAt: Date.now(),
          source: 'EventBus/DOMAIN_WALLET_STATE',
          freshness: 'FRESH',
          confidence: 1.0
        }
      };
      this.state.lastUpdatedAt = Date.now();
      this.savePersistedData();
    });

    this.eventBus.on(EventTypes.COMMUNICATION_STATE_UPDATED, (event: StandardEvent) => {
      const p = event.payload; // Should be partial or full CommunicationState
      
      if (!this.state.communication) {
        this.state.communication = { platforms: {} };
      }

      const platformId = p.platformId;
      if (platformId && p.platformData) {
         this.state.communication.platforms[platformId] = p.platformData;
      }
      
      this.state.lastUpdatedAt = Date.now();
      this.savePersistedData();
    });

    // In the future, listen to DOMAIN_TEMPORAL_STATE, DOMAIN_LOCATION_STATE, etc.
  }

  private loadPersistedData() {
    try {
      if (fs.existsSync(this.persistPath)) {
        const data = fs.readFileSync(this.persistPath, 'utf8');
        const parsed = JSON.parse(data);
        if (parsed.ids && Array.isArray(parsed.ids)) {
          this.processedObservationIds = new Set(parsed.ids);
        }
        if (parsed.state && typeof parsed.state === 'object') {
          // Do a defensive merge to preserve types
          this.state = {
            ...this.state,
            ...parsed.state
          };
        }
      }
    } catch (e) {
      console.error('[WorldStateService] Failed to load persisted data:', e);
    }
  }

  private savePersistedData() {
    try {
      const dir = path.dirname(this.persistPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const payload = {
        ids: Array.from(this.processedObservationIds),
        state: this.state
      };
      
      const data = JSON.stringify(payload);
      const tempPath = this.persistPath + '.tmp';
      fs.writeFileSync(tempPath, data, 'utf8');
      fs.renameSync(tempPath, this.persistPath);
      
    } catch (e) {
      console.error('[WorldStateService] Failed to save persisted data:', e);
    }
  }

  // --- Explicit Reality Getters ---
  
  public getWalletState(): WalletState | null {
    return this.state.wallet;
  }

  public getTemporalState(): TemporalState | null {
    return this.state.temporal;
  }

  /**
   * @deprecated Legacy ingestion method. Reality should enter through EventBus now.
   */
  public ingest(observation: Observation<any, any>): boolean {
    const idempotencyKey = observation.source.externalReferenceId;

    if (this.processedObservationIds.has(idempotencyKey)) {
      return false; // No-op, already processed
    }

    // Mark as processed
    this.processedObservationIds.add(idempotencyKey);
    this.savePersistedData();

    return true;
  }
}

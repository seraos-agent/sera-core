import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../events/types';
import { Observation, WorldStateSnapshot, WalletState, TemporalState, UserProfileState } from './types';
import { SupabaseRestClient } from '../persistence/SupabaseRestClient';
import {
  formatTemporalReality,
  resolveTimezoneFromPhone,
  isValidTimezone,
  FormattedTemporalReality
} from './temporalUtils';

export interface WorldStateServiceOptions {
  persistLocally?: boolean;
  supabaseClient?: SupabaseRestClient | null;
}

export class WorldStateService {
  private state: WorldStateSnapshot;
  private processedObservationIds: Set<string>;
  private basePath: string;
  private persistPath: string;
  private eventBus: EventEmitter;
  private readonly persistLocally: boolean;
  private readonly supabaseClient?: SupabaseRestClient | null;
  private readonly sessionId: string;
  private loadPromise: Promise<void> | null = null;
  private cloudSaveTimer: NodeJS.Timeout | null = null;

  constructor(
    eventBus: EventEmitter,
    sessionId: string = 'dev',
    options: WorldStateServiceOptions = {}
  ) {
    this.eventBus = eventBus;
    this.sessionId = sessionId;
    this.persistLocally = options.persistLocally ?? true;
    this.supabaseClient = options.supabaseClient !== undefined
      ? options.supabaseClient
      : SupabaseRestClient.fromEnvironment();
    this.state = this.getDefaultState();
    
    this.basePath = path.join(process.cwd(), '.data');
    const safeId = sessionId.toLowerCase().replace(/[^a-z0-9]/g, '');
    this.persistPath = path.join(this.basePath, `world_state_${safeId}.json`);
    this.processedObservationIds = new Set<string>();
    
    this.loadPersistedData();
    this.loadPromise = this.loadFromCloud();
    this.subscribeToReality();
  }

  public async ensureLoaded(): Promise<void> {
    if (this.loadPromise) {
      await this.loadPromise;
    }
  }

  private async loadFromCloud(): Promise<void> {
    if (!this.supabaseClient) return;
    try {
      const rows = await this.supabaseClient.select<{ session_id: string; snapshot: any }>(
        'sera_memory_snapshots',
        `session_id=eq.${encodeURIComponent(this.sessionId)}`
      );

      if (rows && rows.length > 0 && rows[0].snapshot) {
        const snap = rows[0].snapshot;
        let modified = false;

        if (snap.profile) {
          if (!this.state.profile || (snap.profile.updatedAt && snap.profile.updatedAt >= (this.state.profile.updatedAt || 0))) {
            this.state.profile = {
              ...this.state.profile,
              ...snap.profile
            };
            modified = true;
            console.log(`[WorldStateService] Restored userProfile from Supabase for ${this.sessionId}: preferredName="${snap.profile.preferredName || ''}", timezone="${snap.profile.timezone || ''}", location="${snap.profile.location || ''}"`);
          }
        }

        if (modified) {
          this.savePersistedDataLocalOnly();
        }
      }
    } catch (e) {
      console.warn('[WorldStateService] Note: Could not fetch profile from Supabase snapshot:', e instanceof Error ? e.message : e);
    }
  }

  private scheduleCloudSave(): void {
    if (!this.supabaseClient) return;
    if (this.cloudSaveTimer) clearTimeout(this.cloudSaveTimer);
    this.cloudSaveTimer = setTimeout(() => {
      void this.saveToCloud();
    }, 1000);
  }

  private async saveToCloud(): Promise<void> {
    if (!this.supabaseClient) return;
    try {
      let existingSnapshot: any = {};
      try {
        const rows = await this.supabaseClient.select<{ snapshot: any }>(
          'sera_memory_snapshots',
          `session_id=eq.${encodeURIComponent(this.sessionId)}`
        );
        if (rows && rows.length > 0 && rows[0].snapshot) {
          existingSnapshot = rows[0].snapshot;
        }
      } catch {}

      existingSnapshot.profile = this.state.profile;

      await this.supabaseClient.upsert('sera_memory_snapshots', {
        session_id: this.sessionId,
        snapshot: existingSnapshot,
        updated_at: new Date().toISOString(),
      }, 'session_id');
      console.log(`[WorldStateService] Synced userProfile to Supabase for ${this.sessionId}.`);
    } catch (e) {
      console.warn('[WorldStateService] Failed to persist profile to Supabase:', e instanceof Error ? e.message : e);
    }
  }

  private getDefaultState(): WorldStateSnapshot {
    return {
      lastUpdatedAt: Date.now(),
      wallet: null,
      temporal: null,
      communication: null,
      profile: null
    };
  }



  private subscribeToReality() {
    this.eventBus.on(EventTypes.DOMAIN_WALLET_STATE, (event: StandardEvent) => {
      const p = event.payload as any;
      this.state.wallet = {
        address: p.address,
        vaultAddress: p.vaultAddress,
        balance: parseFloat(p.balance) || 0,
        vaultBalance: parseFloat(p.vaultBalance) || 0,
        vaultBalances: p.vaultBalances || { base: p.vaultBalance || "0", polygon: "0", ethereum: "0" },
        network: p.network || 'unknown',
        asset: p.asset || 'USDC',
        syncing: p.syncing || false,
        agentCredits: p.agentCredits,
        tier: p.tier,
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

    this.eventBus.on('USER_PROFILE_UPDATED', (event: any) => {
      const p = event.payload || event;
      if (p.preferredName !== undefined || p.timezone !== undefined || p.location !== undefined) {
        this.state.profile = {
          ...this.state.profile,
          ...(p.preferredName !== undefined ? { preferredName: p.preferredName } : {}),
          ...(p.timezone !== undefined ? { timezone: p.timezone } : {}),
          ...(p.location !== undefined ? { location: p.location } : {}),
          updatedAt: Date.now(),
          notes: p.notes !== undefined ? p.notes : this.state.profile?.notes
        };
        this.state.lastUpdatedAt = Date.now();
        this.savePersistedData();
        console.log(`[WorldStateService] UserProfile updated: preferredName="${this.state.profile.preferredName || ''}", timezone="${this.state.profile.timezone || ''}", location="${this.state.profile.location || ''}"`);
      }
    });

    this.eventBus.on(EventTypes.TEMPORAL_TICK, (event: StandardEvent<any>) => {
      const nowMs = event.payload?.timestampUtc || event.timestamp || Date.now();
      const currentTz = this.state.profile?.timezone || 'Asia/Jakarta';
      const formatted = formatTemporalReality(new Date(nowMs), currentTz, this.state.profile?.location);
      this.state.temporal = {
        currentTime: formatted.currentTime,
        timezone: formatted.timezone,
        utcIso: formatted.utcIso,
        utcFormatted: formatted.utcFormatted,
        localFormatted: formatted.localFormatted,
        detectedCountry: formatted.detectedCountry,
        quality: {
          updatedAt: formatted.currentTime,
          source: 'TemporalClockService/TEMPORAL_TICK',
          freshness: 'FRESH',
          confidence: 1.0
        }
      };
      this.state.lastUpdatedAt = Date.now();
    });
  }

  private loadPersistedData() {
    if (!this.persistLocally) return;
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

  private savePersistedDataLocalOnly() {
    if (!this.persistLocally) return;
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

  private savePersistedData() {
    this.savePersistedDataLocalOnly();
    if (this.state.profile) {
      this.scheduleCloudSave();
    }
  }

  // --- Explicit Reality Getters ---
  
  public getWalletState(): WalletState | null {
    return this.state.wallet;
  }

  /**
   * Resolves canonical world temporal reality using multi-tier resolution:
   * 1. User Profile saved timezone / travel location
   * 2. Client explicit timezone (e.g. browser Intl)
   * 3. Phone country code heuristic (WhatsApp E.164)
   * 4. Default fallback: Asia/Jakarta
   */
  public resolveTemporalReality(options?: { timezone?: string; phone?: string }): FormattedTemporalReality {
    let targetTz: string = 'Asia/Jakarta';
    let detectedCountry: string | undefined = undefined;

    // Tier 1: User profile preference / remembered location
    if (this.state.profile?.timezone && isValidTimezone(this.state.profile.timezone)) {
      targetTz = this.state.profile.timezone;
      detectedCountry = this.state.profile.location || 'User Profile Setting';
    }
    // Tier 2: Client explicit timezone (e.g. Web UI browser Intl)
    else if (options?.timezone && isValidTimezone(options.timezone)) {
      targetTz = options.timezone;
      detectedCountry = 'Client Browser Locale';
    }
    // Tier 3: Phone country code heuristic (WhatsApp E.164)
    else if (options?.phone) {
      const phoneResolved = resolveTimezoneFromPhone(options.phone);
      if (phoneResolved) {
        targetTz = phoneResolved.timezone;
        detectedCountry = phoneResolved.country;
      }
    }

    const reality = formatTemporalReality(new Date(), targetTz, detectedCountry);

    // Keep WorldState temporal snapshot continuously fresh (Rule 2: WorldState Owns Reality)
    this.state.temporal = {
      currentTime: reality.currentTime,
      timezone: reality.timezone,
      utcIso: reality.utcIso,
      utcFormatted: reality.utcFormatted,
      localFormatted: reality.localFormatted,
      detectedCountry: reality.detectedCountry,
      quality: {
        updatedAt: reality.currentTime,
        source: 'TemporalReality/WorldStateService',
        freshness: 'FRESH',
        confidence: 1.0
      }
    };
    this.state.lastUpdatedAt = Date.now();

    return reality;
  }

  public getTemporalState(): TemporalState {
    if (!this.state.temporal) {
      this.resolveTemporalReality();
    }
    return this.state.temporal!;
  }

  public getUserProfile(): UserProfileState | null {
    return this.state.profile;
  }

  public setUserPreferredName(name: string): void {
    this.state.profile = {
      ...this.state.profile,
      preferredName: name,
      updatedAt: Date.now()
    };
    this.state.lastUpdatedAt = Date.now();
    this.savePersistedData();
  }

  public setUserLocation(location: string, timezone?: string): void {
    let safeTz = timezone && isValidTimezone(timezone) ? timezone : this.state.profile?.timezone;
    if (!safeTz && location) {
      const locLower = location.toLowerCase();
      if (locLower.includes('mekkah') || locLower.includes('makkah') || locLower.includes('madinah') || locLower.includes('riyadh') || locLower.includes('arab saudi') || locLower.includes('saudi')) {
        safeTz = 'Asia/Riyadh';
      } else if (locLower.includes('sydney') || locLower.includes('australia')) {
        safeTz = 'Australia/Sydney';
      } else if (locLower.includes('tokyo') || locLower.includes('jepang') || locLower.includes('japan')) {
        safeTz = 'Asia/Tokyo';
      } else if (locLower.includes('london') || locLower.includes('inggris') || locLower.includes('uk')) {
        safeTz = 'Europe/London';
      }
    }

    this.state.profile = {
      ...this.state.profile,
      location,
      ...(safeTz ? { timezone: safeTz } : {}),
      updatedAt: Date.now()
    };
    this.state.lastUpdatedAt = Date.now();
    this.savePersistedData();
    console.log(`[WorldStateService] User location updated: location="${location}", timezone="${safeTz || 'unchanged'}"`);
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

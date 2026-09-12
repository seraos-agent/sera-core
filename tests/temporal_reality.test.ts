import { EventEmitter } from 'events';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorldStateService } from '../src/core/world-state/WorldStateService';
import {
  resolveTimezoneFromPhone,
  formatTemporalReality,
  isValidTimezone
} from '../src/core/world-state/temporalUtils';
import { CognitiveContextBuilder } from '../src/capabilities/dialogue/CognitiveContextBuilder';
import { EventTypes } from '../src/core/events/types';

describe('Temporal Reality & World Clock System', () => {
  describe('temporalUtils', () => {
    it('should accurately resolve timezone and country from international E.164 phone numbers', () => {
      // Indonesia (+62)
      const idRes = resolveTimezoneFromPhone('6281234567890');
      expect(idRes).toBeDefined();
      expect(idRes?.timezone).toBe('Asia/Jakarta');
      expect(idRes?.country).toContain('Indonesia');

      // Australia (+61)
      const auRes = resolveTimezoneFromPhone('+61412345678');
      expect(auRes).toBeDefined();
      expect(auRes?.timezone).toBe('Australia/Sydney');
      expect(auRes?.country).toContain('Australia');

      // Saudi Arabia (+966) - Umrah / Hajj destination
      const saRes = resolveTimezoneFromPhone('966501234567');
      expect(saRes).toBeDefined();
      expect(saRes?.timezone).toBe('Asia/Riyadh');
      expect(saRes?.country).toContain('Saudi Arabia');

      // United States (+1)
      const usRes = resolveTimezoneFromPhone('+14155552671');
      expect(usRes).toBeDefined();
      expect(usRes?.timezone).toBe('America/New_York');

      // United Kingdom (+44)
      const ukRes = resolveTimezoneFromPhone('447911123456');
      expect(ukRes).toBeDefined();
      expect(ukRes?.timezone).toBe('Europe/London');

      // Invalid / Empty phone
      expect(resolveTimezoneFromPhone('')).toBeNull();
      expect(resolveTimezoneFromPhone('invalid')).toBeNull();
    });

    it('should format canonical UTC and local reality strings deterministically', () => {
      const fixedDate = new Date('2026-09-12T16:00:00.000Z');
      
      const realityWib = formatTemporalReality(fixedDate, 'Asia/Jakarta', 'Indonesia (+62)');
      expect(realityWib.utcFormatted).toContain('Saturday, September 12, 2026');
      expect(realityWib.utcFormatted).toContain('16:00:00 UTC');
      expect(realityWib.localFormatted).toContain('23:00:00 WIB');
      expect(realityWib.localFormatted).toContain('Asia/Jakarta, UTC+7');

      const realityMakkah = formatTemporalReality(fixedDate, 'Asia/Riyadh', 'Makkah, Saudi Arabia');
      expect(realityMakkah.localFormatted).toContain('19:00:00 AST');
      expect(realityMakkah.localFormatted).toContain('Asia/Riyadh, UTC+3');

      const realitySydney = formatTemporalReality(fixedDate, 'Australia/Sydney', 'Australia');
      expect(realitySydney.localFormatted).toContain('02:00:00 AEST');
      expect(realitySydney.localFormatted).toContain('Australia/Sydney, UTC+10');
    });

    it('should validate IANA timezones correctly', () => {
      expect(isValidTimezone('Asia/Jakarta')).toBe(true);
      expect(isValidTimezone('Asia/Riyadh')).toBe(true);
      expect(isValidTimezone('Australia/Sydney')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Invalid/Nowhere')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });
  });

  describe('WorldStateService Temporal Resolution', () => {
    let eventBus: EventEmitter;
    let worldState: WorldStateService;

    beforeEach(() => {
      eventBus = new EventEmitter();
      worldState = new WorldStateService(eventBus, 'test-temporal-session', { persistLocally: false, supabaseClient: null });
    });

    it('should resolve default timezone to Asia/Jakarta if no options are passed', () => {
      const reality = worldState.resolveTemporalReality();
      expect(reality.timezone).toBe('Asia/Jakarta');
      expect(reality.utcFormatted).toContain('UTC');
      expect(reality.localFormatted).toContain('WIB');
      expect(worldState.getTemporalState().timezone).toBe('Asia/Jakarta');
    });

    it('should resolve timezone from phone country code (e.g. Australia +61)', () => {
      const reality = worldState.resolveTemporalReality({ phone: '+61412345678' });
      expect(reality.timezone).toBe('Australia/Sydney');
      expect(reality.detectedCountry).toContain('Australia');
      expect(reality.localFormatted).toContain('Australia/Sydney');
    });

    it('should prioritize UserProfile location/timezone over phone number (e.g. Indonesian on Umrah in Makkah)', () => {
      // User has an Indonesian phone number (+62)
      // But user registered that they are currently in Makkah
      worldState.setUserLocation('Makkah, Saudi Arabia', 'Asia/Riyadh');

      const reality = worldState.resolveTemporalReality({ phone: '628123456789' });
      expect(reality.timezone).toBe('Asia/Riyadh');
      expect(reality.detectedCountry).toBe('Makkah, Saudi Arabia');
      expect(reality.localFormatted).toContain('AST');
      expect(reality.localFormatted).toContain('Asia/Riyadh, UTC+3');
    });

    it('should auto-infer Asia/Riyadh when setUserLocation contains Mekkah/Makkah', () => {
      worldState.setUserLocation('Lagi Umroh di Mekkah');
      const profile = worldState.getUserProfile();
      expect(profile?.location).toBe('Lagi Umroh di Mekkah');
      expect(profile?.timezone).toBe('Asia/Riyadh');
    });

    it('should update TemporalState when TEMPORAL_TICK event is emitted', () => {
      const now = Date.now();
      eventBus.emit(EventTypes.TEMPORAL_TICK, {
        id: 'tick-1',
        type: EventTypes.TEMPORAL_TICK,
        source: 'TemporalClockService',
        timestamp: now,
        payload: { timestampUtc: now }
      });

      const state = worldState.getTemporalState();
      expect(state).toBeDefined();
      expect(state.utcFormatted).toContain('UTC');
      expect(state.quality.source).toBe('TemporalClockService/TEMPORAL_TICK');
    });
  });

  describe('CognitiveContextBuilder Working Memory Integration', () => {
    let eventBus: EventEmitter;
    let worldState: WorldStateService;
    let mockMemoryQuery: any;
    let mockChatHistory: any;
    let contextBuilder: CognitiveContextBuilder;

    beforeEach(() => {
      eventBus = new EventEmitter();
      worldState = new WorldStateService(eventBus, 'test-builder-session', { persistLocally: false, supabaseClient: null });
      mockMemoryQuery = {
        query: vi.fn().mockResolvedValue([]),
        toPromptContext: vi.fn().mockReturnValue({ items: [] })
      };
      mockChatHistory = {
        getUiMessages: vi.fn().mockReturnValue([])
      };
      contextBuilder = new CognitiveContextBuilder(
        worldState,
        mockMemoryQuery,
        mockChatHistory,
        null
      );
    });

    it('should inject canonical UTC anchor and local time into working memory for WhatsApp users', async () => {
      const messages = await contextBuilder.build(
        false,
        'Sekarang jam berapa?',
        {
          platform: 'whatsapp',
          channelId: '628123456789',
          senderPhone: '628123456789'
        }
      );

      const workingMemoryMsg = messages.find(m => m.role === 'system' && typeof m.content === 'string' && m.content.includes('[COGNITIVE STATE (WORKING MEMORY)]'));
      expect(workingMemoryMsg).toBeDefined();
      expect(typeof workingMemoryMsg?.content === 'string' && workingMemoryMsg.content).toContain('[TEMPORAL REALITY (CANONICAL WORLD CLOCK)]');
      expect(workingMemoryMsg?.content).toContain('- Universal Anchor (UTC):');
      expect(workingMemoryMsg?.content).toContain('- User Primary Local Time:');
      expect(workingMemoryMsg?.content).toContain('WIB (Asia/Jakarta, UTC+7)');
      expect(workingMemoryMsg?.content).toContain('Temporal Awareness & World Time:');
    });

    it('should adapt to travel context in working memory when user location is set to Makkah', async () => {
      worldState.setUserLocation('Makkah, Arab Saudi', 'Asia/Riyadh');

      const messages = await contextBuilder.build(
        false,
        'Jam berapa sekarang di sini?',
        {
          platform: 'whatsapp',
          channelId: '628123456789',
          senderPhone: '628123456789'
        }
      );

      const workingMemoryMsg = messages.find(m => m.role === 'system' && typeof m.content === 'string' && m.content.includes('[COGNITIVE STATE (WORKING MEMORY)]'));
      expect(typeof workingMemoryMsg?.content === 'string' && workingMemoryMsg.content).toContain('- User Location / Travel Base: Makkah, Arab Saudi');
      expect(typeof workingMemoryMsg?.content === 'string' && workingMemoryMsg.content).toContain('AST (Asia/Riyadh, UTC+3)');
    });
  });
});

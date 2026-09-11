import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { ChatHistoryStore } from '../src/capabilities/dialogue/ChatHistoryStore';
import { SupabaseMemoryPersistence } from '../src/memory/persistence/SupabaseMemoryPersistence';
import { SubscriptionLedger } from '../src/server/billing/SubscriptionLedger';
import { WorldStateService } from '../src/core/world-state/WorldStateService';

describe('Platform Conversation History & Memory Persistence Across Deployments', () => {
  const testSessionId = 'test_wa_session_456';
  const dataDir = path.join(process.cwd(), '.data');
  const localHistoryFile = path.join(dataDir, `chat_history_${testSessionId.replace(/[^a-z0-9]/g, '')}.json`);

  beforeEach(() => {
    if (fs.existsSync(localHistoryFile)) {
      fs.unlinkSync(localHistoryFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(localHistoryFile)) {
      fs.unlinkSync(localHistoryFile);
    }
  });

  describe('ChatHistoryStore Platform Turns', () => {
    it('appends and retrieves platform turns while maintaining channel isolation from UI messages', () => {
      const store = new ChatHistoryStore(testSessionId, { persistLocally: true, supabaseClient: null });

      // Add a Web UI message
      store.appendUiMessage({
        id: 101,
        role: 'user',
        content: 'Hello from Web Dashboard'
      });

      // Add WhatsApp conversation turns
      store.appendPlatformTurn('whatsapp', '62812345678', 'user', 'Halo Sera, posting Threads barusan hapus ya');
      store.appendPlatformTurn('whatsapp', '62812345678', 'assistant', 'Siap, postingan barusan mau langsung aku hapus dari Threads ya?');

      // 1. Verify Web UI only contains UI message (Strict Channel Segregation)
      const uiMessages = store.getUiMessages();
      expect(uiMessages.length).toBe(1);
      expect(uiMessages[0].content).toBe('Hello from Web Dashboard');

      // 2. Verify WhatsApp platform turns are stored under the correct context key
      const waTurns = store.getPlatformTurns('whatsapp:62812345678');
      expect(waTurns.length).toBe(2);
      expect(waTurns[0].role).toBe('user');
      expect(waTurns[0].content).toBe('Halo Sera, posting Threads barusan hapus ya');
      expect(waTurns[1].role).toBe('assistant');
      expect(waTurns[1].content).toBe('Siap, postingan barusan mau langsung aku hapus dari Threads ya?');

      // 3. Verify cold restart rehydrates from local storage
      const rehydratedStore = new ChatHistoryStore(testSessionId, { persistLocally: true, supabaseClient: null });
      const rehydratedWaTurns = rehydratedStore.getPlatformTurns('whatsapp:62812345678');
      expect(rehydratedWaTurns.length).toBe(2);
      expect(rehydratedWaTurns[0].content).toBe('Halo Sera, posting Threads barusan hapus ya');
      expect(rehydratedWaTurns[1].content).toBe('Siap, postingan barusan mau langsung aku hapus dari Threads ya?');
    });

    it('syncs platform turns to and from Supabase cloud snapshots', async () => {
      let cloudStorage: Record<string, any> = {};

      const mockSupabaseClient: any = {
        select: vi.fn().mockImplementation(async (table: string, query: string) => {
          if (table === 'sera_memory_snapshots') {
            return cloudStorage[testSessionId] ? [cloudStorage[testSessionId]] : [];
          }
          return [];
        }),
        upsert: vi.fn().mockImplementation(async (table: string, payload: any) => {
          if (table === 'sera_memory_snapshots') {
            cloudStorage[payload.session_id] = payload;
          }
          return { data: payload, error: null };
        })
      };

      const store = new ChatHistoryStore(testSessionId, {
        persistLocally: false,
        supabaseClient: mockSupabaseClient
      });

      store.appendPlatformTurn('whatsapp', '62899988877', 'user', 'Siapa nama saya?');
      store.appendPlatformTurn('whatsapp', '62899988877', 'assistant', 'Halo! Enaknya aku panggil siapa ya?');

      // Give async saveCloud a tick to execute
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(cloudStorage[testSessionId]).toBeDefined();
      expect(cloudStorage[testSessionId].snapshot.platformMessages).toBeDefined();
      expect(cloudStorage[testSessionId].snapshot.platformMessages['whatsapp:62899988877'].length).toBe(2);

      // Simulate a completely new container instance booting on Cloud Run
      const freshStore = new ChatHistoryStore(testSessionId, {
        persistLocally: false,
        supabaseClient: mockSupabaseClient
      });
      await freshStore.ensureLoaded();

      const restoredTurns = freshStore.getPlatformTurns('whatsapp:62899988877');
      expect(restoredTurns.length).toBe(2);
      expect(restoredTurns[0].content).toBe('Siapa nama saya?');
      expect(restoredTurns[1].content).toBe('Halo! Enaknya aku panggil siapa ya?');
    });
  });

  describe('SupabaseMemoryPersistence Safe Merge', () => {
    it('merges WorkingMemory snapshots without clobbering chat or platform history', async () => {
      let cloudSnapshot: any = {
        session_id: testSessionId,
        snapshot: {
          uiMessages: [{ id: 1, content: 'Dashboard message' }],
          platformMessages: {
            'whatsapp:628111222': [{ role: 'user', content: 'Halo dari WA' }]
          }
        },
        updated_at: new Date().toISOString()
      };

      const mockSupabaseClient: any = {
        select: vi.fn().mockImplementation(async () => [cloudSnapshot]),
        upsert: vi.fn().mockImplementation(async (table: string, payload: any) => {
          cloudSnapshot = payload;
          return { data: payload, error: null };
        })
      };

      const persistence = new SupabaseMemoryPersistence(testSessionId, mockSupabaseClient);

      // Save a working memory snapshot with events and beliefs
      await persistence.save({
        events: [{ id: 'evt-1', type: 'TEST_EVENT', timestamp: 12345 } as any],
        beliefs: [{ id: 'bel-1', subject: 'user_preference', predicate: 'language', object: 'id' } as any]
      });

      // Verify that uiMessages and platformMessages were preserved!
      expect(cloudSnapshot.snapshot.uiMessages.length).toBe(1);
      expect(cloudSnapshot.snapshot.uiMessages[0].content).toBe('Dashboard message');
      expect(cloudSnapshot.snapshot.platformMessages['whatsapp:628111222'].length).toBe(1);
      expect(cloudSnapshot.snapshot.events.length).toBe(1);
      expect(cloudSnapshot.snapshot.beliefs.length).toBe(1);

      // Verify load restores events and beliefs
      const loaded = await persistence.load();
      expect(loaded).toBeDefined();
      expect(loaded?.beliefs.length).toBe(1);
      expect(loaded?.events.length).toBe(1);
    });
  });

  describe('SubscriptionLedger Cloud Rehydration Across Container Restarts', () => {
    it('persists and restores user computation credits from Supabase snapshot', async () => {
      let cloudStorage: Record<string, any> = {};

      const mockSupabaseClient: any = {
        select: vi.fn().mockImplementation(async (table: string, query: string) => {
          if (table === 'sera_memory_snapshots') {
            return cloudStorage['global:subscriptions'] ? [cloudStorage['global:subscriptions']] : [];
          }
          return [];
        }),
        upsert: vi.fn().mockImplementation(async (table: string, payload: any) => {
          if (table === 'sera_memory_snapshots') {
            cloudStorage[payload.session_id] = payload;
          }
          return { data: payload, error: null };
        })
      };

      const customPath1 = path.join(dataDir, `sub_test_1_${Date.now()}.json`);
      const customPath2 = path.join(dataDir, `sub_test_2_${Date.now()}.json`);

      const ledger = new SubscriptionLedger(customPath1, {
        supabaseClient: mockSupabaseClient
      });

      // Credit user with 500,000 computation tokens
      const userAddr = '0x1234567890abcdef1234567890abcdef12345678';
      ledger.credit(userAddr, 500000, 2.5);

      // Wait for debounce saveToCloud (1s timer, or invoke private/wait)
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(cloudStorage['global:subscriptions']).toBeDefined();
      expect(cloudStorage['global:subscriptions'].snapshot.entries[userAddr].agentCredits).toBe(500000);

      // Simulate a fresh container boot on Cloud Run where local subscriptions.json does not exist
      const freshLedger = new SubscriptionLedger(customPath2, {
        supabaseClient: mockSupabaseClient
      });
      await freshLedger.ensureLoaded();

      // Verify that credits were completely restored from Supabase and user has credit!
      expect(freshLedger.hasCredit(userAddr)).toBe(true);
      expect(freshLedger.get(userAddr)?.agentCredits).toBe(500000);

      // Cleanup
      if (fs.existsSync(customPath1)) fs.unlinkSync(customPath1);
      if (fs.existsSync(customPath2)) fs.unlinkSync(customPath2);
    });
  });

  describe('WorldStateService UserProfile Persistence Across Container Restarts', () => {
    it('persists and restores preferredName from Supabase snapshot when container restarts', async () => {
      let cloudStorage: Record<string, any> = {};

      const mockSupabaseClient: any = {
        select: vi.fn().mockImplementation(async (table: string, query: string) => {
          if (table === 'sera_memory_snapshots') {
            return cloudStorage[testSessionId] ? [cloudStorage[testSessionId]] : [];
          }
          return [];
        }),
        upsert: vi.fn().mockImplementation(async (table: string, payload: any) => {
          if (table === 'sera_memory_snapshots') {
            cloudStorage[payload.session_id] = payload;
          }
          return { data: payload, error: null };
        })
      };

      const eventBus = new EventEmitter();
      const service = new WorldStateService(eventBus, testSessionId, {
        persistLocally: false,
        supabaseClient: mockSupabaseClient
      });

      // User introduces themselves
      service.setUserPreferredName('Budi Santoso');

      // Wait for cloud save debounce
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(cloudStorage[testSessionId]).toBeDefined();
      expect(cloudStorage[testSessionId].snapshot.profile.preferredName).toBe('Budi Santoso');

      // Simulate container restart (fresh WorldStateService with no local file)
      const freshService = new WorldStateService(eventBus, testSessionId, {
        persistLocally: false,
        supabaseClient: mockSupabaseClient
      });
      await freshService.ensureLoaded();

      const restoredProfile = freshService.getUserProfile();
      expect(restoredProfile).toBeDefined();
      expect(restoredProfile?.preferredName).toBe('Budi Santoso');
    });
  });
});

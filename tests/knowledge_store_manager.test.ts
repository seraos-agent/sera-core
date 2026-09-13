import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KnowledgeStoreManager } from '../src/capabilities/vertex-search/KnowledgeStoreManager';
import { VertexSearchGoalHandler } from '../src/runtime/handlers/VertexSearchGoalHandler';
import { GoalBridge } from '../src/runtime/GoalBridge';
import { EventEmitter } from 'events';
import { EventTypes } from '../src/core/events/types';

describe('Phase 3: KnowledgeStoreManager & Domain Knowledge Stores', () => {
  describe('KnowledgeStoreManager', () => {
    let mockVertexService: any;
    let manager: KnowledgeStoreManager;

    beforeEach(() => {
      mockVertexService = {
        getAccessToken: vi.fn().mockResolvedValue('fake-access-token'),
        search: vi.fn().mockResolvedValue({
          success: true,
          query: 'PPh 23',
          summary: 'PPh 23 rate is 2% for services under Indonesian tax regulations.',
          totalResults: 1,
          source: 'vertex_agent_builder',
          documents: [
            {
              id: 'doc-tax-1',
              title: 'UU PPh Pasal 23',
              uri: 'https://pajak.go.id/pph23',
              snippets: ['Withholding tax for service fees is 2%...'],
              extractiveAnswers: ['2% for services'],
              mimeType: 'text/html'
            }
          ],
          citations: ['https://pajak.go.id/pph23']
        })
      };

      manager = new KnowledgeStoreManager({
        vertexSearchService: mockVertexService,
        projectId: 'test-proj',
        location: 'global'
      });
    });

    it('initializes with default seed stores', () => {
      const stores = manager.listStores();
      expect(stores.length).toBeGreaterThanOrEqual(2);

      const general = manager.getStore('general_knowledge');
      const tax = manager.getStore('tax_and_finance');

      expect(general).toBeDefined();
      expect(tax).toBeDefined();
      expect(tax?.category).toBe('finance');
    });

    it('registers and retrieves custom knowledge stores', () => {
      manager.registerStore({
        id: 'ecommerce_sops',
        name: 'E-Commerce Merchant SOPs',
        description: 'Standard operating procedures for merchant fulfillment',
        dataStoreId: 'ecommerce-sop-datastore',
        siteUris: ['https://help.tokopedia.com/*'],
        category: 'operations',
        createdAt: Date.now()
      });

      const store = manager.getStore('ecommerce_sops');
      expect(store).toBeDefined();
      expect(store?.name).toBe('E-Commerce Merchant SOPs');
    });

    it('searches specific store and delegates to VertexSearchService with correct dataStoreId', async () => {
      const result = await manager.searchStore('PPh 23 withholding', 'tax_and_finance', 3);

      expect(result.success).toBe(true);
      expect(result.storeName).toBe('Indonesian Tax & Financial Regulations');
      expect(mockVertexService.search).toHaveBeenCalledWith({
        query: 'PPh 23 withholding',
        pageSize: 3,
        dataStoreId: 'sera-tax-finance-knowledge'
      });
    });

    it('ingests website pattern via Discovery Engine targetSites endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'projects/test-proj/locations/global/collections/default_collection/dataStores/sera-tax-finance-knowledge/siteSearchEngine/targetSites/ts-123' })
      });

      const customManager = new KnowledgeStoreManager({
        vertexSearchService: mockVertexService,
        projectId: 'test-proj',
        fetchImpl: mockFetch as any
      });

      const res = await customManager.ingestWebsite('tax_and_finance', 'https://jdih.kemenkeu.go.id/*');
      expect(res.success).toBe(true);
      expect(res.siteUri).toBe('https://jdih.kemenkeu.go.id/*');
      expect(res.targetSiteName).toContain('ts-123');
      expect(mockFetch).toHaveBeenCalled();
    });

    it('handles website ingestion rejection cleanly without throwing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Permission denied on targetSites'
      });

      const customManager = new KnowledgeStoreManager({
        vertexSearchService: mockVertexService,
        projectId: 'test-proj',
        fetchImpl: mockFetch as any
      });

      const res = await customManager.ingestWebsite('tax_and_finance', 'https://unauthorized.org/*');
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('403');
    });
  });

  describe('VertexSearchGoalHandler with KnowledgeStoreManager', () => {
    it('executes handleKnowledgeSearch and emits structured result event', async () => {
      const emitResult = vi.fn();
      const mockVertex = {} as any;
      const mockSync = {} as any;

      const mockStoreManager = {
        searchStore: vi.fn().mockResolvedValue({
          success: true,
          query: 'refund policy',
          storeName: 'E-Commerce SOPs',
          summary: 'Refunds must be processed within 48 hours.',
          totalResults: 1,
          source: 'vertex_agent_builder',
          documents: [
            {
              title: 'Refund SOP',
              uri: 'https://sop.internal/refund',
              snippets: ['Refunds must be processed within 48 hours.'],
              extractiveAnswers: [],
              mimeType: 'text/html'
            }
          ],
          citations: ['https://sop.internal/refund']
        })
      };

      const handler = new VertexSearchGoalHandler(
        () => mockVertex,
        () => mockSync,
        'test-session',
        emitResult,
        () => mockStoreManager as any
      );

      await handler.handleKnowledgeSearch('req-know-1', {
        query: 'what is our refund policy?',
        storeId: 'ecommerce_sops'
      });

      expect(emitResult).toHaveBeenCalledWith(
        'req-know-1',
        true,
        expect.objectContaining({
          success: true,
          query: 'refund policy',
          storeName: 'E-Commerce SOPs',
          summary: 'Refunds must be processed within 48 hours.',
          documents: [
            expect.objectContaining({
              title: 'Refund SOP',
              link: 'https://sop.internal/refund'
            })
          ]
        })
      );
    });

    it('rejects empty query with error', async () => {
      const emitResult = vi.fn();
      const handler = new VertexSearchGoalHandler(
        () => ({} as any),
        () => ({} as any),
        'test-session',
        emitResult
      );

      await handler.handleKnowledgeSearch('req-err', {});
      expect(emitResult).toHaveBeenCalledWith(
        'req-err',
        false,
        {},
        'Must provide a search query for KNOWLEDGE_SEARCH.'
      );
    });
  });

  describe('GoalBridge routing for KNOWLEDGE_SEARCH', () => {
    it('routes KNOWLEDGE_SEARCH action to VertexSearchGoalHandler', async () => {
      const eventBus = new EventEmitter();
      const bridge = new GoalBridge(eventBus, 'test-know-session');

      const emitSpy = vi.spyOn(eventBus, 'emit');

      // Dispatch DOMAIN_ACTION_DISPATCHED with KNOWLEDGE_SEARCH
      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
        id: 'goal-know-test',
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        source: 'dialogue',
        timestamp: Date.now(),
        payload: {
          actionType: 'KNOWLEDGE_SEARCH',
          actionPayload: {
            query: 'tax rules'
          },
          requestId: 'req-know-bridge-test'
        }
      });

      // Wait a moment for async execution
      await new Promise(r => setTimeout(r, 200));

      const completionEvents = emitSpy.mock.calls.filter(
        c => c[0] === EventTypes.DOMAIN_GOAL_RESULT
      );

      expect(completionEvents.length).toBeGreaterThan(0);
      const completion = completionEvents[0][1] as any;
      expect(completion.payload.requestId).toBe('req-know-bridge-test');
    });
  });
});

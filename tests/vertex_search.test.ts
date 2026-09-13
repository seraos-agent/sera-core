import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VertexSearchService, VaultSearchResult } from '../src/capabilities/vertex-search/VertexSearchService';
import { VaultIndexSyncService } from '../src/capabilities/vertex-search/VaultIndexSyncService';
import { VertexSearchGoalHandler } from '../src/runtime/handlers/VertexSearchGoalHandler';
import { ToolExecutionHandler } from '../src/capabilities/dialogue/ToolExecutionHandler';

describe('VertexSearchService', () => {
  it('should return an error result if query is empty', async () => {
    const service = new VertexSearchService();
    const result = await service.searchVault('');
    expect(result.success).toBe(false);
    expect(result.errorMessage).toContain('cannot be empty');
  });

  it('should fallback to drive search if no GCP access token is available', async () => {
    const mockFallback = vi.fn().mockResolvedValue({
      success: true,
      query: 'invoice',
      documents: [{ id: 'doc-1', title: 'Invoice_Aug.xlsx', snippets: ['Total: $500'], extractiveAnswers: [] }],
      citations: [],
      totalResults: 1,
      source: 'vault_drive_fallback'
    } as VaultSearchResult);

    const service = new VertexSearchService({
      getAccessToken: async () => null // No token available
    });

    const result = await service.searchVault('invoice', {
      fallbackDriveSearch: mockFallback
    });

    expect(mockFallback).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.source).toBe('vault_drive_fallback');
    expect(result.documents.length).toBe(1);
  });

  it('should successfully parse Vertex AI Search API response when credentials exist', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            id: 'doc-123',
            document: {
              structData: {
                title: 'Q3 Financial Report.pdf',
                uri: 'https://drive.google.com/file/d/doc-123/view',
                mimeType: 'application/pdf'
              },
              derivedStructData: {
                snippets: [{ snippet: 'Total revenue in Q3 reached $1.2M.' }],
                extractive_answers: [{ content: 'Total revenue in Q3 was $1,200,000.' }]
              }
            },
            modelRelevanceScore: 0.95
          }
        ],
        summary: {
          summaryText: 'Based on Q3 Financial Report, total revenue reached $1.2M with strong margins.',
          summaryWithMetadata: {
            citationMetadata: {
              citations: [
                {
                  sources: [{ referenceIndex: 0 }]
                }
              ]
            }
          }
        },
        totalSize: 1
      })
    } as any);

    const service = new VertexSearchService({
      projectId: 'test-project',
      location: 'global',
      dataStoreId: 'test-store',
      getAccessToken: async () => 'test-mock-token',
      fetchImpl: mockFetch
    });

    const result = await service.searchVault('revenue Q3');

    expect(result.success).toBe(true);
    expect(result.source).toBe('vertex_ai_search');
    expect(result.summary).toContain('total revenue reached $1.2M');
    expect(result.documents.length).toBe(1);
    expect(result.documents[0].title).toBe('Q3 Financial Report.pdf');
    expect(result.documents[0].snippets[0]).toContain('$1.2M');
    expect(result.citations.length).toBe(1);
    expect(result.citations[0].sourceTitle).toBe('Q3 Financial Report.pdf');
  });

  it('should fall back to drive search if the Vertex API returns an HTTP error status', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Permission Denied / Data Store Not Found'
    } as any);

    const mockFallback = vi.fn().mockResolvedValue({
      success: true,
      query: 'revenue',
      documents: [{ id: 'doc-drive', title: 'Local_Revenue.xlsx', snippets: ['Rev: $10k'], extractiveAnswers: [] }],
      citations: [],
      totalResults: 1,
      source: 'vault_drive_fallback'
    } as VaultSearchResult);

    const service = new VertexSearchService({
      getAccessToken: async () => 'mock-token',
      fetchImpl: mockFetch
    });

    const result = await service.searchVault('revenue', {
      fallbackDriveSearch: mockFallback
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFallback).toHaveBeenCalledTimes(1);
    expect(result.source).toBe('vault_drive_fallback');
    expect(result.documents[0].title).toBe('Local_Revenue.xlsx');
  });

  it('should construct valid payload when upserting a document into branch 0', async () => {
    let capturedUrl = '';
    let capturedBody: any = null;

    const mockFetch = vi.fn().mockImplementation(async (url, opts) => {
      capturedUrl = url;
      capturedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    });

    const service = new VertexSearchService({
      projectId: 'my-project',
      dataStoreId: 'my-datastore',
      getAccessToken: async () => 'mock-token',
      fetchImpl: mockFetch as any
    });

    const success = await service.upsertDocument({
      id: 'file-456',
      title: 'Marketing Budget.xlsx',
      uri: 'https://drive.google.com/file/d/file-456',
      textContent: 'Ad Spend: Facebook $5000, Google $8000'
    });

    expect(success).toBe(true);
    expect(capturedUrl).toContain('/branches/0/documents/file-456');
    expect(capturedBody.structData.title).toBe('Marketing Budget.xlsx');
    expect(capturedBody.content.rawBytes).toBeDefined();
  });
});

describe('VaultIndexSyncService', () => {
  let mockDrive: any;
  let searchService: VertexSearchService;
  let syncService: VaultIndexSyncService;

  beforeEach(() => {
    mockDrive = {
      listFiles: vi.fn(),
      readFile: vi.fn()
    };
    searchService = new VertexSearchService({
      getAccessToken: async () => null // Force fallback drive search
    });
    syncService = new VaultIndexSyncService({
      vertexSearchService: searchService,
      googleDriveCapability: mockDrive
    });
  });

  it('should ignore cognitive state files during file sync', async () => {
    const success = await syncService.syncFile('user-1', 'snap-1', 'sera_memory_snapshot.json');
    expect(success).toBe(false);
    expect(mockDrive.readFile).not.toHaveBeenCalled();
  });

  it('should perform drive fallback search and extract relevant excerpts across multiple files', async () => {
    mockDrive.listFiles.mockResolvedValue([
      { id: 'f1', name: 'Q1_Financials.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { id: 'f2', name: 'Meeting_Notes.md', mimeType: 'text/markdown' },
      { id: 'f3', name: 'sera_memory.json', mimeType: 'application/json' }
    ]);

    mockDrive.readFile.mockImplementation(async (_userId: string, fileId: string) => {
      if (fileId === 'f1') {
        return 'Row 1: Gross Sales $50,000\nRow 2: Marketing Expenses $12,500\nRow 3: Net Profit $37,500';
      }
      if (fileId === 'f2') {
        return '# Meeting Notes\nDiscussed marketing budget allocation and expanding digital ads.';
      }
      return '';
    });

    const result = await syncService.search('user-1', 'marketing expenses');

    expect(result.success).toBe(true);
    expect(result.source).toBe('vault_drive_fallback');
    expect(result.documents.length).toBeGreaterThanOrEqual(1);
    expect(result.documents[0].title).toBe('Q1_Financials.xlsx');
    expect(result.documents[0].snippets[0]).toContain('Marketing Expenses $12,500');
    expect(result.citations.length).toBeGreaterThanOrEqual(1);
  });
});

describe('VertexSearchGoalHandler', () => {
  it('should handle VAULT_DEEP_SEARCH and emit compact structured results', async () => {
    const mockSyncService = {
      search: vi.fn().mockResolvedValue({
        success: true,
        query: 'unpaid invoices',
        summary: 'Found 2 unpaid invoices in Accounts Payable.',
        totalResults: 2,
        source: 'vertex_ai_search',
        documents: [
          {
            title: 'Invoice_VendorA.pdf',
            uri: 'https://drive.google.com/file/d/inv1',
            mimeType: 'application/pdf',
            snippets: ['Amount Due: $450 - Unpaid'],
            extractiveAnswers: []
          }
        ],
        citations: [{ sourceTitle: 'Invoice_VendorA.pdf', sourceUri: 'https://drive.google.com/file/d/inv1' }]
      })
    };

    let emittedSuccess = false;
    let emittedData: any = null;

    const handler = new VertexSearchGoalHandler(
      () => ({} as any),
      () => mockSyncService as any,
      'test-session',
      (_reqId, success, data) => {
        emittedSuccess = success;
        emittedData = data;
      }
    );

    await handler.handleVaultSearch('req-123', { query: 'unpaid invoices' });

    expect(emittedSuccess).toBe(true);
    expect(emittedData.query).toBe('unpaid invoices');
    expect(emittedData.summary).toContain('Found 2 unpaid invoices');
    expect(emittedData.documents.length).toBe(1);
    expect(emittedData.documents[0].title).toBe('Invoice_VendorA.pdf');
    expect(emittedData.documents[0].excerpt).toContain('Amount Due: $450 - Unpaid');
  });

  it('should emit error if query is missing in handleVaultSearch', async () => {
    let emittedSuccess = true;
    let emittedError = '';

    const handler = new VertexSearchGoalHandler(
      () => ({} as any),
      () => ({} as any),
      'test-session',
      (_reqId, success, _data, err) => {
        emittedSuccess = success;
        emittedError = err || '';
      }
    );

    await handler.handleVaultSearch('req-missing', {});

    expect(emittedSuccess).toBe(false);
    expect(emittedError).toContain('Must provide a search query');
  });
});

describe('ToolExecutionHandler Cognitive Label', () => {
  it('should return human-friendly label for VAULT_DEEP_SEARCH', () => {
    const label = ToolExecutionHandler.getCognitiveActivityLabel('VAULT_DEEP_SEARCH');
    expect(label).toBe('Searching Google Drive Vault');
  });

  it('should return human-friendly label for VAULT_SYNC_INDEX', () => {
    const label = ToolExecutionHandler.getCognitiveActivityLabel('VAULT_SYNC_INDEX');
    expect(label).toBe('Indexing Google Drive Vault');
  });
});

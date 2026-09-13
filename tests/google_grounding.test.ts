import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleGroundingService } from '../src/capabilities/search/GoogleGroundingService';
import { WebSearchCapability } from '../src/capabilities/search/WebSearchCapability';
import { BraveSearchCapability } from '../src/capabilities/search/BraveSearchCapability';

describe('GoogleGroundingService & WebSearchCapability', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GoogleGroundingService', () => {
    it('returns error when search query is empty', async () => {
      const service = new GoogleGroundingService({
        getAccessToken: async () => 'mock-token'
      });
      const res = await service.searchWithGrounding('');
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('cannot be empty');
    });

    it('returns error when no GCP access token is available', async () => {
      const service = new GoogleGroundingService({
        getAccessToken: async () => null
      });
      const res = await service.searchWithGrounding('latest AI developments');
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('access token not available');
    });

    it('successfully calls Vertex AI Grounding endpoint and extracts citations', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: 'Sera OS is an autonomous agent operating system powered by multi-agent cognitive architecture.'
                  }
                ],
                role: 'model'
              },
              groundingMetadata: {
                webSearchQueries: ['Sera OS autonomous agent'],
                groundingChunks: [
                  {
                    web: {
                      title: 'Sera OS Official Documentation',
                      uri: 'https://seraos.xyz/docs'
                    }
                  }
                ]
              }
            }
          ]
        })
      });

      const service = new GoogleGroundingService({
        projectId: 'test-project',
        location: 'asia-southeast1',
        model: 'gemini-2.5-flash',
        fetchImpl: mockFetch as any,
        getAccessToken: async () => 'valid-mock-token'
      });

      const res = await service.searchWithGrounding('What is Sera OS?');
      expect(res.success).toBe(true);
      expect(res.source).toBe('google_search_grounding');
      expect(res.groundedText).toContain('Sera OS is an autonomous agent');
      expect(res.citations.length).toBe(1);
      expect(res.citations[0].title).toBe('Sera OS Official Documentation');
      expect(res.citations[0].url).toBe('https://seraos.xyz/docs');
      expect(res.searchQueries).toContain('Sera OS autonomous agent');

      // Verify fetch call payload
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('https://asia-southeast1-aiplatform.googleapis.com');
      expect(options.headers.Authorization).toBe('Bearer valid-mock-token');
      const body = JSON.parse(options.body);
      expect(body.tools[0].googleSearch).toBeDefined();
    });

    it('gracefully handles API errors from Vertex AI', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'Forbidden: API not enabled'
      });

      const service = new GoogleGroundingService({
        fetchImpl: mockFetch as any,
        getAccessToken: async () => 'mock-token'
      });

      const res = await service.searchWithGrounding('Test query');
      expect(res.success).toBe(false);
      expect(res.errorMessage).toContain('403');
    });
  });

  describe('WebSearchCapability', () => {
    it('exposes WEB_SEARCH tool with parameters', () => {
      const webSearch = new WebSearchCapability();
      const tools = webSearch.getTools();
      expect(tools.length).toBe(1);
      expect(tools[0].name).toBe('WEB_SEARCH');
      expect(tools[0].parameters.required).toContain('query');
    });

    it('uses Google Grounding when available and formats output with citations', async () => {
      const mockGroundingService = {
        searchWithGrounding: vi.fn().mockResolvedValue({
          success: true,
          query: 'Indonesia GDP 2026',
          groundedText: 'Indonesia GDP reached $1.5 trillion in 2026.',
          citations: [
            {
              title: 'Bank Indonesia Economic Report',
              url: 'https://bi.go.id/report'
            }
          ],
          searchQueries: ['Indonesia GDP 2026'],
          source: 'google_search_grounding'
        })
      } as any;

      const mockBrave = {
        executeTool: vi.fn()
      } as any;

      const webSearch = new WebSearchCapability({
        groundingService: mockGroundingService,
        braveSearchCapability: mockBrave
      });

      const res = await webSearch.executeTool('WEB_SEARCH', { query: 'Indonesia GDP 2026' });
      expect(res.source).toBe('google_search_grounding');
      expect(res.output).toContain('Indonesia GDP reached $1.5 trillion');
      expect(res.output).toContain('Bank Indonesia Economic Report');
      expect(res.results.length).toBe(1);
      expect(res.results[0].url).toBe('https://bi.go.id/report');
      expect(mockBrave.executeTool).not.toHaveBeenCalled();
    });

    it('falls back to Brave Search when Google Grounding fails', async () => {
      const mockGroundingService = {
        searchWithGrounding: vi.fn().mockResolvedValue({
          success: false,
          query: 'test query',
          errorMessage: 'Token expired',
          citations: [],
          searchQueries: []
        })
      } as any;

      const mockBrave = {
        executeTool: vi.fn().mockResolvedValue({
          query: 'test query',
          count: 1,
          output: '[1] Fallback Result\nURL: https://fallback.org',
          results: [{ title: 'Fallback Result', url: 'https://fallback.org', description: 'desc' }]
        })
      } as any;

      const webSearch = new WebSearchCapability({
        groundingService: mockGroundingService,
        braveSearchCapability: mockBrave
      });

      const res = await webSearch.executeTool('WEB_SEARCH', { query: 'test query' });
      expect(res.source).toBe('brave_search_fallback');
      expect(res.output).toContain('Fallback Result');
      expect(mockBrave.executeTool).toHaveBeenCalledTimes(1);
    });

    it('executes with tool aliases search and brave_web_search', async () => {
      const mockGroundingService = {
        searchWithGrounding: vi.fn().mockResolvedValue({
          success: true,
          query: 'test',
          groundedText: 'Result text',
          citations: [],
          searchQueries: []
        })
      } as any;

      const webSearch = new WebSearchCapability({
        groundingService: mockGroundingService
      });

      const res1 = await webSearch.executeTool('search', { query: 'test' });
      expect(res1.source).toBe('google_search_grounding');

      const res2 = await webSearch.executeTool('brave_web_search', { query: 'test' });
      expect(res2.source).toBe('google_search_grounding');
    });

    it('throws error when query is empty', async () => {
      const webSearch = new WebSearchCapability();
      await expect(webSearch.executeTool('WEB_SEARCH', { query: '' })).rejects.toThrow('cannot be empty');
    });
  });
});

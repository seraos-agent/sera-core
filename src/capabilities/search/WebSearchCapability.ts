import { SeraTool } from '../../core/cognitive/Tool';
import { BraveSearchCapability, SearchResultItem } from './BraveSearchCapability';
import { GoogleGroundingService, GoogleGroundingResult } from './GoogleGroundingService';

export interface WebSearchCapabilityConfig {
  groundingService?: GoogleGroundingService;
  braveSearchCapability?: BraveSearchCapability;
}

/**
 * WebSearchCapability — Hybrid Intelligent Web Search with Fallback Chain.
 * 
 * Priority Chain:
 * 1. Google Search Grounding via Vertex AI (Gemini + live Google index with citations)
 * 2. Brave Search API (fallback when GCP credentials/quota are not active)
 * 
 * Architectural Compliance:
 * - English-only code and comments (Rule 7)
 * - Seamless fallback without user disruption
 * - Preserves existing tool contract (WEB_SEARCH, search, brave_web_search)
 */
export class WebSearchCapability {
  private readonly groundingService: GoogleGroundingService;
  private readonly braveSearch: BraveSearchCapability;

  constructor(config: WebSearchCapabilityConfig = {}) {
    this.groundingService = config.groundingService || new GoogleGroundingService();
    this.braveSearch = config.braveSearchCapability || new BraveSearchCapability();
  }

  getTools(): SeraTool[] {
    return [
      {
        name: 'WEB_SEARCH',
        description: 'Search the live web for real-time information, news, articles, current events, definitions, people, places, facts, or technical documentation. Powered by Google Search Grounding with Brave Search fallback. ALWAYS invoke this tool when asked about current information, specific terms, or external topics.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to look up on the web'
            }
          },
          required: ['query']
        },
        requiresApproval: false,
        irreversible: false,
        unsafe: false
      }
    ];
  }

  async executeTool(name: string, args: Record<string, any>): Promise<any> {
    if (name === 'WEB_SEARCH' || name === 'search' || name === 'brave_web_search') {
      const query = String(args.query || args.q || args.searchQuery || '').trim();
      if (!query) {
        throw new Error('Search query cannot be empty.');
      }

      // 1. Attempt Google Search Grounding via Vertex AI
      try {
        const groundingRes: GoogleGroundingResult = await this.groundingService.searchWithGrounding(query);
        if (groundingRes.success && groundingRes.groundedText) {
          const results: SearchResultItem[] = groundingRes.citations.map(c => ({
            title: c.title,
            url: c.url,
            description: c.snippet || c.title
          }));

          let output = `[Google Search Grounding]\n${groundingRes.groundedText}`;
          if (groundingRes.citations.length > 0) {
            output += `\n\nSources:\n` + groundingRes.citations.map((c, i) => `[${i + 1}] ${c.title} (${c.url})`).join('\n');
          }

          return {
            query,
            count: results.length,
            output,
            results,
            source: 'google_search_grounding'
          };
        }
      } catch (err: any) {
        console.warn('[WebSearchCapability] Google Search Grounding failed, falling back to Brave Search:', err.message);
      }

      // 2. Fallback to Brave Search
      const braveResult = await this.braveSearch.executeTool('WEB_SEARCH', args);
      return {
        ...braveResult,
        source: 'brave_search_fallback'
      };
    }

    throw new Error(`Unknown tool for WebSearchCapability: ${name}`);
  }
}

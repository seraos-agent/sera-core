import { SeraTool } from '../../core/cognitive/Tool';

export interface SearchResultItem {
  title: string;
  url: string;
  description: string;
  publishedAge?: string;
}

export class BraveSearchCapability {
  getTools(): SeraTool[] {
    return [
      {
        name: 'search',
        description: 'Search the live web for real-time information, news, articles, current events, definitions, people, places, facts, or technical documentation. ALWAYS invoke this tool when asked about current information, specific terms, or external topics.',
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
    if (name === 'search' || name === 'brave_web_search') {
      const query = String(args.query || args.q || '').trim();
      if (!query) {
        throw new Error('Search query cannot be empty.');
      }

      const apiKey = process.env.BRAVE_API_KEY;
      if (!apiKey) {
        throw new Error('BRAVE_API_KEY is not configured on the server.');
      }

      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Brave Search API error (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      const webResults = data?.web?.results || [];

      const formattedResults: SearchResultItem[] = webResults.map((r: any) => ({
        title: r.title || 'Untitled',
        url: r.url,
        description: (r.description || '').replace(/<[^>]*>?/gm, ''), // strip HTML tags
        publishedAge: r.age
      }));

      const summaryText = formattedResults.length > 0
        ? formattedResults.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description}`).join('\n\n')
        : `No relevant search results found for query "${query}".`;

      return {
        query,
        count: formattedResults.length,
        output: summaryText,
        results: formattedResults
      };
    }

    throw new Error(`Unknown tool for BraveSearchCapability: ${name}`);
  }
}

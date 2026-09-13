export interface GroundingCitation {
  title: string;
  url: string;
  snippet?: string;
}

export interface GoogleGroundingResult {
  success: boolean;
  query: string;
  groundedText?: string;
  searchQueries: string[];
  citations: GroundingCitation[];
  source: 'google_search_grounding' | 'brave_search_fallback';
  errorMessage?: string;
}

export interface GoogleGroundingConfig {
  projectId?: string;
  location?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
}

/**
 * GoogleGroundingService — Real-time Google Search Grounding via Vertex AI.
 * 
 * Leverages Google Search Grounding with Gemini on Vertex AI to provide
 * up-to-date factual search results with authoritative citations and grounded reasoning.
 * 
 * Architectural Compliance:
 * - English-only code and comments (Rule 7)
 * - Safe error handling with graceful fallback signaling
 * - Zero external SDK bloat (native REST API)
 */
export class GoogleGroundingService {
  private readonly projectId: string;
  private readonly location: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessTokenCustom?: () => Promise<string | null>;

  constructor(config: GoogleGroundingConfig = {}) {
    this.projectId = config.projectId || process.env.VERTEX_SEARCH_PROJECT_ID || process.env.GCP_PROJECT_ID || 'sera-core';
    this.location = config.location || process.env.VERTEX_LOCATION || process.env.VERTEX_SEARCH_LOCATION || 'asia-southeast1';
    this.model = config.model || process.env.VERTEX_GROUNDING_MODEL || 'gemini-2.5-flash';
    this.fetchImpl = config.fetchImpl || fetch;
    this.getAccessTokenCustom = config.getAccessToken;
  }

  /**
   * Retrieves Google Cloud OAuth2 access token.
   */
  public async getAccessToken(): Promise<string | null> {
    if (this.getAccessTokenCustom) {
      try {
        const token = await this.getAccessTokenCustom();
        if (token) return token;
      } catch (err) {
        console.warn('[GoogleGroundingService] Custom token provider failed:', err);
      }
    }

    if (process.env.GCP_ACCESS_TOKEN) {
      return process.env.GCP_ACCESS_TOKEN;
    }

    // Try Google Cloud Metadata Server (Cloud Run / GCE default service account)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);

      const metadataRes = await this.fetchImpl(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        {
          headers: { 'Metadata-Flavor': 'Google' },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      if (metadataRes.ok) {
        const json = (await metadataRes.json()) as { access_token?: string };
        if (json.access_token) return json.access_token;
      }
    } catch {
      // Not in GCP environment
    }

    // Try local gcloud CLI if running in local development environment
    try {
      const { execSync } = require('child_process');
      const token = execSync('gcloud auth print-access-token', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 })
        .toString()
        .trim();
      if (token) return token;
    } catch {
      // gcloud CLI not installed or not authenticated
    }

    return null;
  }

  /**
   * Executes a search grounded in Google Search via Vertex AI.
   */
  public async searchWithGrounding(query: string): Promise<GoogleGroundingResult> {
    const cleanQuery = query?.trim();
    if (!cleanQuery) {
      return {
        success: false,
        query: '',
        searchQueries: [],
        citations: [],
        source: 'google_search_grounding',
        errorMessage: 'Search query cannot be empty.'
      };
    }

    const token = await this.getAccessToken();
    if (!token) {
      return {
        success: false,
        query: cleanQuery,
        searchQueries: [],
        citations: [],
        source: 'google_search_grounding',
        errorMessage: 'Google Cloud access token not available.'
      };
    }

    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}:generateContent`;

    const requestPayload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Search the web and provide accurate, factual, and up-to-date information for this query:\n"${cleanQuery}"\nInclude specific figures, dates, and names where applicable.`
            }
          ]
        }
      ],
      tools: [
        {
          googleSearch: {}
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[GoogleGroundingService] Vertex AI Grounding error (${response.status}):`, errorText);
        return {
          success: false,
          query: cleanQuery,
          searchQueries: [],
          citations: [],
          source: 'google_search_grounding',
          errorMessage: `Vertex AI API error (${response.status}): ${errorText}`
        };
      }

      const data = (await response.json()) as any;
      return this.parseGroundingResponse(cleanQuery, data);
    } catch (err: any) {
      console.warn('[GoogleGroundingService] Failed to execute Google Search Grounding:', err.message);
      return {
        success: false,
        query: cleanQuery,
        searchQueries: [],
        citations: [],
        source: 'google_search_grounding',
        errorMessage: err.message || 'Network error connecting to Vertex AI Grounding.'
      };
    }
  }

  /**
   * Parses the Vertex AI Gemini Grounding response into structured citations and grounded answer.
   */
  private parseGroundingResponse(query: string, data: any): GoogleGroundingResult {
    const candidate = data?.candidates?.[0];
    const groundedText = candidate?.content?.parts?.[0]?.text || '';
    const groundingMeta = candidate?.groundingMetadata || {};

    const searchQueries: string[] = groundingMeta.webSearchQueries || [];
    const citations: GroundingCitation[] = [];

    // Parse groundingChunks
    const chunks = groundingMeta.groundingChunks || [];
    for (const chunk of chunks) {
      if (chunk.web?.uri) {
        citations.push({
          title: chunk.web.title || chunk.web.uri,
          url: chunk.web.uri,
          snippet: undefined
        });
      }
    }

    return {
      success: true,
      query,
      groundedText,
      searchQueries,
      citations,
      source: 'google_search_grounding'
    };
  }
}

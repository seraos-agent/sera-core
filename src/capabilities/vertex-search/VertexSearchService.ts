export interface VertexSearchConfig {
  projectId?: string;
  location?: string;
  dataStoreId?: string;
  servingConfigId?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
}

export interface SearchCitation {
  sourceTitle: string;
  sourceUri?: string;
  snippet?: string;
}

export interface SearchDocumentResult {
  id: string;
  title: string;
  uri?: string;
  mimeType?: string;
  snippets: string[];
  extractiveAnswers: string[];
  relevanceScore?: number;
}

export interface VaultSearchResult {
  success: boolean;
  query: string;
  summary?: string;
  documents: SearchDocumentResult[];
  citations: SearchCitation[];
  totalResults: number;
  source: 'vertex_ai_search' | 'vault_drive_fallback';
  errorMessage?: string;
}

export interface DocumentIngestPayload {
  id: string;
  title: string;
  uri?: string;
  mimeType?: string;
  jsonData?: Record<string, any>;
  textContent?: string;
}

/**
 * VertexSearchService — Enterprise RAG & Semantic Search for Google Drive SERA Vault.
 * 
 * Powered by Google Cloud Vertex AI Search / Discovery Engine via native REST API (Option A).
 * Supports Generative Summaries, Extractive Answers, Document Snippets, and Citations.
 * Provides graceful fallback to Google Drive Vault file search when Vertex AI credentials or Data Stores are offline.
 * 
 * Architectural Compliance:
 * - English-only code and comments (Rule 7)
 * - Safe error boundaries and zero dependency bloat
 */
export class VertexSearchService {
  private readonly projectId: string;
  private readonly location: string;
  private readonly dataStoreId: string;
  private readonly servingConfigId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly getAccessTokenCustom?: () => Promise<string | null>;

  constructor(config: VertexSearchConfig = {}) {
    this.projectId = config.projectId || process.env.VERTEX_SEARCH_PROJECT_ID || process.env.GCP_PROJECT_ID || 'sera-core';
    this.location = config.location || process.env.VERTEX_SEARCH_LOCATION || 'global';
    this.dataStoreId = config.dataStoreId || process.env.VERTEX_DATA_STORE_ID || 'sera-vault';
    this.servingConfigId = config.servingConfigId || 'default_search';
    this.fetchImpl = config.fetchImpl || fetch;
    this.getAccessTokenCustom = config.getAccessToken;
  }

  /**
   * Retrieves Google Cloud OAuth2 access token.
   * Priority:
   * 1. Custom token provider (if injected)
   * 2. Explicit environment token (GCP_ACCESS_TOKEN)
   * 3. GCP Cloud Run / Compute Engine metadata server
   */
  public async getAccessToken(): Promise<string | null> {
    if (this.getAccessTokenCustom) {
      try {
        const token = await this.getAccessTokenCustom();
        if (token) return token;
      } catch (err) {
        console.warn('[VertexSearchService] Custom token provider failed:', err);
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
      // Not running in GCP Compute environment or metadata server unreachable
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
   * Executes a semantic search query against the Vertex AI Search Data Store.
   */
  public async searchVault(
    query: string,
    options: {
      pageSize?: number;
      filter?: string;
      dataStoreId?: string;
      fallbackDriveSearch?: () => Promise<VaultSearchResult>;
    } = {}
  ): Promise<VaultSearchResult> {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) {
      return {
        success: false,
        query: '',
        documents: [],
        citations: [],
        totalResults: 0,
        source: 'vertex_ai_search',
        errorMessage: 'Search query cannot be empty.'
      };
    }

    const token = await this.getAccessToken();

    // If no GCP token is available, attempt fallback drive search if provided
    if (!token) {
      if (options.fallbackDriveSearch) {
        console.log('[VertexSearchService] GCP credentials not active. Using Google Drive Vault fallback search.');
        return await options.fallbackDriveSearch();
      }

      return {
        success: false,
        query: cleanQuery,
        documents: [],
        citations: [],
        totalResults: 0,
        source: 'vertex_ai_search',
        errorMessage: 'Vertex AI credentials unavailable and no fallback search provided.'
      };
    }

    const targetDataStoreId = options.dataStoreId || this.dataStoreId;
    const pageSize = options.pageSize || 5;
    const searchEndpoint = `https://discoveryengine.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${targetDataStoreId}/servingConfigs/${this.servingConfigId}:search`;

    const requestBody: Record<string, any> = {
      query: cleanQuery,
      pageSize,
      contentSearchSpec: {
        summarySpec: {
          summaryResultCount: pageSize,
          includeCitations: true
        },
        extractiveContentSpec: {
          maxExtractiveAnswerCount: 2,
          maxExtractiveSegmentCount: 2
        },
        snippetSpec: {
          returnSnippet: true
        }
      }
    };

    if (options.filter) {
      requestBody.filter = options.filter;
    }

    try {
      const response = await this.fetchImpl(searchEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Goog-User-Project': this.projectId
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[VertexSearchService] Vertex AI Search API returned ${response.status}: ${errorText}`);

        if (options.fallbackDriveSearch) {
          console.log('[VertexSearchService] Falling back to direct Drive Vault search due to API response.');
          return await options.fallbackDriveSearch();
        }

        return {
          success: false,
          query: cleanQuery,
          documents: [],
          citations: [],
          totalResults: 0,
          source: 'vertex_ai_search',
          errorMessage: `Vertex AI Search failed with status ${response.status}: ${errorText}`
        };
      }

      const data = (await response.json()) as any;
      const results: any[] = data.results || [];
      const summaryText: string = data.summary?.summaryText || '';

      const documents: SearchDocumentResult[] = results.map((item: any) => {
        const doc = item.document || {};
        const structData = doc.structData || {};
        const derivedStruct = doc.derivedStructData || {};

        const title = structData.title || derivedStruct.title || doc.name || 'Untitled Document';
        const uri = structData.uri || structData.link || derivedStruct.link || derivedStruct.uri || '';
        const mimeType = structData.mimeType || derivedStruct.mimeType || '';

        const extractiveAnswers: string[] = [];
        if (Array.isArray(derivedStruct.extractive_answers)) {
          for (const ans of derivedStruct.extractive_answers) {
            if (ans.content) extractiveAnswers.push(ans.content);
          }
        }

        const snippets: string[] = [];
        if (Array.isArray(derivedStruct.snippets)) {
          for (const snip of derivedStruct.snippets) {
            if (snip.snippet) snippets.push(snip.snippet);
          }
        }

        return {
          id: doc.id || item.id || '',
          title,
          uri: uri || undefined,
          mimeType: mimeType || undefined,
          snippets,
          extractiveAnswers,
          relevanceScore: item.modelRelevanceScore
        };
      });

      const citations: SearchCitation[] = [];
      if (Array.isArray(data.summary?.summaryWithMetadata?.citationMetadata?.citations)) {
        for (const cit of data.summary.summaryWithMetadata.citationMetadata.citations) {
          for (const src of cit.sources || []) {
            const idx = src.referenceIndex;
            if (typeof idx === 'number' && documents[idx]) {
              citations.push({
                sourceTitle: documents[idx].title,
                sourceUri: documents[idx].uri,
                snippet: documents[idx].snippets[0] || documents[idx].extractiveAnswers[0]
              });
            }
          }
        }
      }

      return {
        success: true,
        query: cleanQuery,
        summary: summaryText || undefined,
        documents,
        citations,
        totalResults: data.totalSize || documents.length,
        source: 'vertex_ai_search'
      };
    } catch (err: any) {
      console.error('[VertexSearchService] Unexpected error in searchVault:', err);

      if (options.fallbackDriveSearch) {
        return await options.fallbackDriveSearch();
      }

      return {
        success: false,
        query: cleanQuery,
        documents: [],
        citations: [],
        totalResults: 0,
        source: 'vertex_ai_search',
        errorMessage: err.message || 'Unknown network error'
      };
    }
  }

  /**
   * Generic search method compatible with custom data stores and KnowledgeStoreManager.
   */
  public async search(options: {
    query: string;
    pageSize?: number;
    filter?: string;
    dataStoreId?: string;
    fallbackDriveSearch?: () => Promise<VaultSearchResult>;
  }): Promise<VaultSearchResult> {
    return this.searchVault(options.query, options);
  }

  /**
   * Ingests or updates a document into the Vertex AI Search Data Store (Branch 0).
   */
  public async upsertDocument(payload: DocumentIngestPayload): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) {
      console.warn('[VertexSearchService] Cannot upsert document: No GCP access token available.');
      return false;
    }

    const docId = payload.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const endpoint = `https://discoveryengine.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${this.dataStoreId}/branches/0/documents/${docId}`;

    const documentBody: Record<string, any> = {
      name: `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${this.dataStoreId}/branches/0/documents/${docId}`,
      id: docId,
      structData: {
        title: payload.title,
        uri: payload.uri || '',
        mimeType: payload.mimeType || 'text/plain',
        ...(payload.jsonData || {})
      }
    };

    if (payload.textContent) {
      documentBody.content = {
        mimeType: payload.mimeType || 'text/plain',
        rawBytes: Buffer.from(payload.textContent, 'utf-8').toString('base64')
      };
    }

    try {
      const response = await this.fetchImpl(`${endpoint}?allowMissing=true`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Goog-User-Project': this.projectId
        },
        body: JSON.stringify(documentBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[VertexSearchService] Document upsert failed with status ${response.status}: ${errorText}`);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[VertexSearchService] Error upserting document:', err);
      return false;
    }
  }

  /**
   * Deletes a document from the Vertex AI Search Data Store.
   */
  public async deleteDocument(documentId: string): Promise<boolean> {
    const token = await this.getAccessToken();
    if (!token) return false;

    const docId = documentId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const endpoint = `https://discoveryengine.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${this.dataStoreId}/branches/0/documents/${docId}`;

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Goog-User-Project': this.projectId
        }
      });

      return response.ok || response.status === 404;
    } catch (err) {
      console.error('[VertexSearchService] Error deleting document:', err);
      return false;
    }
  }
}

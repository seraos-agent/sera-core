import { VertexSearchService, VaultSearchResult } from './VertexSearchService';

export interface KnowledgeStoreDefinition {
  id: string;
  name: string;
  description: string;
  dataStoreId: string;
  siteUris: string[];
  category: 'finance' | 'legal' | 'tech' | 'operations' | 'custom';
  createdAt: number;
}

export interface IngestSiteResult {
  success: boolean;
  storeId: string;
  siteUri: string;
  targetSiteName?: string;
  errorMessage?: string;
}

export interface KnowledgeStoreManagerConfig {
  vertexSearchService?: VertexSearchService;
  projectId?: string;
  location?: string;
  fetchImpl?: typeof fetch;
}

/**
 * KnowledgeStoreManager — Domain Knowledge Stores & Website Ingestion Manager.
 * 
 * Manages domain-specific knowledge data stores (e.g., specific website crawls, specialized
 * legal/tax databases, corporate playbooks) indexed by Vertex AI Agent Builder / Discovery Engine.
 * 
 * Architectural Compliance:
 * - English-only code and comments (Rule 7)
 * - Safe fallback and structured error handling
 * - Zero external SDK bloat (native REST API)
 */
export class KnowledgeStoreManager {
  private readonly vertexSearchService: VertexSearchService;
  private readonly projectId: string;
  private readonly location: string;
  private readonly fetchImpl: typeof fetch;
  private readonly stores: Map<string, KnowledgeStoreDefinition> = new Map();

  constructor(config: KnowledgeStoreManagerConfig = {}) {
    this.vertexSearchService = config.vertexSearchService || new VertexSearchService();
    this.projectId = config.projectId || process.env.VERTEX_SEARCH_PROJECT_ID || process.env.GCP_PROJECT_ID || 'sera-core';
    this.location = config.location || process.env.VERTEX_SEARCH_LOCATION || 'global';
    this.fetchImpl = config.fetchImpl || fetch;

    this.seedDefaultStores();
  }

  /**
   * Pre-registers standard domain knowledge stores.
   */
  private seedDefaultStores(): void {
    this.registerStore({
      id: 'general_knowledge',
      name: 'General Domain Knowledge',
      description: 'Standard enterprise reference docs and technical guides',
      dataStoreId: process.env.VERTEX_DEFAULT_DATASTORE_ID || 'sera-general-knowledge',
      siteUris: [],
      category: 'tech',
      createdAt: Date.now()
    });

    this.registerStore({
      id: 'tax_and_finance',
      name: 'Indonesian Tax & Financial Regulations',
      description: 'Official regulations, tax law articles, and compliance standards',
      dataStoreId: 'sera-tax-finance-knowledge',
      siteUris: ['https://pajak.go.id/*'],
      category: 'finance',
      createdAt: Date.now()
    });
  }

  /**
   * Registers a new domain knowledge store in the manager.
   */
  public registerStore(store: KnowledgeStoreDefinition): void {
    this.stores.set(store.id, store);
  }

  /**
   * Lists all available knowledge stores.
   */
  public listStores(): KnowledgeStoreDefinition[] {
    return Array.from(this.stores.values());
  }

  /**
   * Retrieves a specific knowledge store by ID.
   */
  public getStore(storeId: string): KnowledgeStoreDefinition | undefined {
    return this.stores.get(storeId);
  }

  /**
   * Searches a specific knowledge store or searches across the default store.
   */
  public async searchStore(
    query: string,
    storeId?: string,
    pageSize: number = 5
  ): Promise<VaultSearchResult & { storeName: string }> {
    const targetStoreId = storeId || 'general_knowledge';
    const store = this.stores.get(targetStoreId);

    const storeName = store ? store.name : targetStoreId;
    const dataStoreId = store ? store.dataStoreId : targetStoreId;

    const result = await this.vertexSearchService.search({
      query,
      pageSize,
      dataStoreId
    });

    return {
      ...result,
      storeName
    };
  }

  /**
   * Registers a public website URL pattern for automatic crawling and indexing into a target store.
   */
  public async ingestWebsite(storeId: string, siteUri: string): Promise<IngestSiteResult> {
    const cleanUri = siteUri?.trim();
    if (!cleanUri) {
      return {
        success: false,
        storeId,
        siteUri: '',
        errorMessage: 'Site URI cannot be empty.'
      };
    }

    const store = this.stores.get(storeId);
    const dataStoreId = store ? store.dataStoreId : storeId;

    const token = await this.vertexSearchService.getAccessToken();
    if (!token) {
      // Record locally if token not available
      if (store && !store.siteUris.includes(cleanUri)) {
        store.siteUris.push(cleanUri);
      }
      return {
        success: true,
        storeId,
        siteUri: cleanUri,
        targetSiteName: `local-registered-${Date.now()}`
      };
    }

    const endpoint = `https://discoveryengine.googleapis.com/v1/projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${dataStoreId}/siteSearchEngine/targetSites`;

    try {
      const response = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          providedUriPattern: cleanUri,
          type: 'INCLUDE'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[KnowledgeStoreManager] Failed to register target site (${response.status}):`, errorText);
        return {
          success: false,
          storeId,
          siteUri: cleanUri,
          errorMessage: `Vertex AI API error (${response.status}): ${errorText}`
        };
      }

      const data = (await response.json()) as any;
      if (store && !store.siteUris.includes(cleanUri)) {
        store.siteUris.push(cleanUri);
      }

      return {
        success: true,
        storeId,
        siteUri: cleanUri,
        targetSiteName: data.name || data.targetSite?.name
      };
    } catch (err: any) {
      console.warn('[KnowledgeStoreManager] Network error registering target site:', err.message);
      return {
        success: false,
        storeId,
        siteUri: cleanUri,
        errorMessage: err.message || 'Failed to connect to Discovery Engine API.'
      };
    }
  }
}

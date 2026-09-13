import { VertexSearchService, VaultSearchResult } from '../../capabilities/vertex-search/VertexSearchService';
import { VaultIndexSyncService } from '../../capabilities/vertex-search/VaultIndexSyncService';
import { KnowledgeStoreManager } from '../../capabilities/vertex-search/KnowledgeStoreManager';
import { EmitResultFn } from './types';

/**
 * VertexSearchGoalHandler — Handles Deep Vault Search and Knowledge Store goal dispatches for SERA.
 * 
 * Supports:
 * - `VAULT_DEEP_SEARCH` / `VAULT_SEARCH`: Enterprise semantic search across all user documents in Google Drive SERA Vault
 * - `VAULT_SYNC_INDEX`: Trigger on-demand indexing of vault documents into Vertex AI Search
 * - `KNOWLEDGE_SEARCH`: Specialized search across curated domain knowledge stores & ingested websites
 * 
 * Architectural Compliance:
 * - English-only code and comments (Rule 7)
 * - Clean boundary handling and error containment
 */
export class VertexSearchGoalHandler {
  constructor(
    private readonly getVertexSearchService: () => VertexSearchService,
    private readonly getVaultIndexSyncService: () => VaultIndexSyncService,
    private readonly sessionId: string,
    private readonly emitResult: EmitResultFn,
    private readonly getKnowledgeStoreManager?: () => KnowledgeStoreManager
  ) {}

  private get searchService(): VertexSearchService {
    return this.getVertexSearchService();
  }

  private get syncService(): VaultIndexSyncService {
    return this.getVaultIndexSyncService();
  }

  /**
   * Executes a deep semantic search across the user's entire Google Drive Vault.
   */
  public async handleVaultSearch(requestId: string, payload: any): Promise<void> {
    try {
      const query = payload?.query || payload?.searchTerm || payload?.q || payload?.prompt;
      if (!query || typeof query !== 'string') {
        throw new Error('Must provide a search query for VAULT_DEEP_SEARCH.');
      }

      const pageSize = typeof payload?.pageSize === 'number' ? payload.pageSize : 5;
      const result: VaultSearchResult = await this.syncService.search(this.sessionId, query, pageSize);

      if (!result.success && result.errorMessage) {
        this.emitResult(requestId, false, {}, result.errorMessage);
        return;
      }

      // Compact response for optimal LLM context consumption
      const responseData = {
        query: result.query,
        summary: result.summary,
        totalResults: result.totalResults,
        source: result.source,
        documents: result.documents.map(d => ({
          title: d.title,
          link: d.uri,
          mimeType: d.mimeType,
          excerpt: d.snippets[0] || d.extractiveAnswers[0] || 'No preview available'
        })),
        citations: result.citations
      };

      this.emitResult(requestId, true, responseData);
    } catch (e: any) {
      console.error('[VertexSearchGoalHandler] Search execution failed:', e);
      this.emitResult(requestId, false, {}, e.message || 'Vault search failed');
    }
  }

  /**
   * Triggers an on-demand re-indexing of all eligible documents in the user's vault.
   */
  public async handleSyncIndex(requestId: string, _payload: any): Promise<void> {
    try {
      const syncStats = await this.syncService.syncAllVaultFiles(this.sessionId);
      this.emitResult(requestId, true, {
        message: `Successfully synchronized ${syncStats.indexed} of ${syncStats.total} files to Vertex AI Search Data Store.`,
        stats: syncStats
      });
    } catch (e: any) {
      console.error('[VertexSearchGoalHandler] Index sync failed:', e);
      this.emitResult(requestId, false, {}, e.message || 'Vault re-indexing failed');
    }
  }

  /**
   * Executes a search across a specialized domain knowledge store (e.g. tax laws, SOPs, corporate guides).
   */
  public async handleKnowledgeSearch(requestId: string, payload: any): Promise<void> {
    try {
      const query = payload?.query || payload?.searchTerm || payload?.q || payload?.prompt;
      if (!query || typeof query !== 'string') {
        throw new Error('Must provide a search query for KNOWLEDGE_SEARCH.');
      }

      const storeId = payload?.storeId || payload?.store || payload?.domain;
      const pageSize = typeof payload?.pageSize === 'number' ? payload.pageSize : 5;

      const storeManager = this.getKnowledgeStoreManager ? this.getKnowledgeStoreManager() : new KnowledgeStoreManager({
        vertexSearchService: this.searchService
      });

      const result = await storeManager.searchStore(query, storeId, pageSize);

      const responseData = {
        success: result.success,
        query: result.query,
        storeName: result.storeName,
        summary: result.summary,
        totalResults: result.totalResults,
        source: result.source,
        documents: result.documents.map((d: any) => ({
          title: d.title,
          link: d.uri,
          mimeType: d.mimeType,
          excerpt: d.snippets[0] || d.extractiveAnswers[0] || 'No preview available'
        })),
        citations: result.citations
      };

      this.emitResult(requestId, true, responseData);
    } catch (e: any) {
      console.error('[VertexSearchGoalHandler] Knowledge search execution failed:', e);
      this.emitResult(requestId, false, {}, e.message || 'Domain knowledge search failed');
    }
  }
}

import { GoogleDriveCapability } from '../google-drive/GoogleDriveCapability';
import { VertexSearchService, VaultSearchResult, SearchDocumentResult } from './VertexSearchService';

export interface VaultIndexSyncConfig {
  vertexSearchService: VertexSearchService;
  googleDriveCapability: GoogleDriveCapability;
}

/**
 * VaultIndexSyncService — Synchronizes Google Drive SERA Vault files with Vertex AI Search Data Store.
 * 
 * Also provides an intelligent fallback multi-file scanner that reads matching documents
 * directly from Google Drive when Vertex AI credentials or Data Stores are not provisioned.
 * 
 * Architectural Compliance:
 * - English-only code and comments (Rule 7)
 * - Safe file filtering (skips binary audio/raw system memory blobs)
 */
export class VaultIndexSyncService {
  private readonly searchService: VertexSearchService;
  private readonly driveCapability: GoogleDriveCapability;

  // Extensions and MIME types suitable for semantic document indexing
  private static readonly INDEXABLE_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.pdf', '.docx', '.xlsx'];
  private static readonly IGNORED_FILES = ['sera_profile', 'sera_memory', 'sera_memory_snapshot', 'sera_journal'];

  constructor(config: VaultIndexSyncConfig) {
    this.searchService = config.vertexSearchService;
    this.driveCapability = config.googleDriveCapability;
  }

  /**
   * Executes a deep vault search with automatic fallback to Google Drive Vault inspection.
   */
  public async search(userId: string, query: string, pageSize: number = 5): Promise<VaultSearchResult> {
    return await this.searchService.searchVault(query, {
      pageSize,
      fallbackDriveSearch: async () => this.performDriveFallbackSearch(userId, query, pageSize)
    });
  }

  /**
   * Indexes a single file from Google Drive into Vertex AI Search.
   */
  public async syncFile(userId: string, fileId: string, filename: string, mimeType?: string): Promise<boolean> {
    const lowerName = filename.toLowerCase();

    // Skip non-indexable files or internal memory snapshots
    if (VaultIndexSyncService.IGNORED_FILES.some(ignored => lowerName.startsWith(ignored))) {
      return false;
    }

    const hasIndexableExt = VaultIndexSyncService.INDEXABLE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    const isGoogleDoc = mimeType?.includes('google-apps');

    if (!hasIndexableExt && !isGoogleDoc) {
      return false;
    }

    try {
      let textContent = '';
      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || mimeType?.includes('spreadsheet')) {
        // Read spreadsheet as text representation
        textContent = await this.driveCapability.readFile(userId, fileId);
      } else {
        textContent = await this.driveCapability.readFile(userId, fileId);
      }

      if (!textContent || textContent.trim().length === 0) {
        return false;
      }

      // Truncate excessively huge documents to prevent memory exhaustion
      const maxChars = 200000;
      const truncated = textContent.length > maxChars ? textContent.slice(0, maxChars) + '... [truncated]' : textContent;

      return await this.searchService.upsertDocument({
        id: fileId,
        title: filename,
        uri: `https://drive.google.com/file/d/${fileId}/view`,
        mimeType: mimeType || 'text/plain',
        textContent: truncated,
        jsonData: {
          filename,
          syncedAt: new Date().toISOString()
        }
      });
    } catch (err) {
      console.warn(`[VaultIndexSyncService] Failed to index file ${filename} (${fileId}):`, err);
      return false;
    }
  }

  /**
   * Syncs all eligible files in the user's SERA Vault into Vertex AI Search.
   */
  public async syncAllVaultFiles(userId: string): Promise<{ total: number; indexed: number }> {
    try {
      const files = await this.driveCapability.listFiles(userId);
      let indexed = 0;

      for (const file of files) {
        const success = await this.syncFile(userId, file.id, file.name, file.mimeType);
        if (success) indexed++;
      }

      console.log(`[VaultIndexSyncService] Vault sync complete for user ${userId}: ${indexed}/${files.length} indexed.`);
      return { total: files.length, indexed };
    } catch (err) {
      console.error(`[VaultIndexSyncService] Error during vault full sync for user ${userId}:`, err);
      return { total: 0, indexed: 0 };
    }
  }

  /**
   * Fallback search implementation that directly queries Google Drive files,
   * inspects matching document contents, and compiles a coherent multi-document result.
   */
  public async performDriveFallbackSearch(userId: string, query: string, maxResults: number = 5): Promise<VaultSearchResult> {
    const cleanQuery = query.toLowerCase().trim();
    const keywords = cleanQuery.split(/\s+/).filter(k => k.length > 2);

    try {
      const allFiles = await this.driveCapability.listFiles(userId);
      if (!allFiles || allFiles.length === 0) {
        return {
          success: true,
          query,
          documents: [],
          citations: [],
          totalResults: 0,
          source: 'vault_drive_fallback',
          summary: 'No documents found in your SERA Google Drive Vault.'
        };
      }

      // Filter out internal memory snapshots
      const eligibleFiles = allFiles.filter((f: any) => {
        const name = (f.name || '').toLowerCase();
        return !VaultIndexSyncService.IGNORED_FILES.some(ignored => name.startsWith(ignored));
      });

      // Score files based on title and content match
      const scoredFiles: Array<{ file: any; score: number; snippet?: string }> = [];

      for (const file of eligibleFiles) {
        const fileName = (file.name || '').toLowerCase();
        let score = 0;

        // Title matching
        if (fileName.includes(cleanQuery)) {
          score += 10;
        } else {
          for (const kw of keywords) {
            if (fileName.includes(kw)) score += 3;
          }
        }

        // Check content for high-probability candidate files (max top 8 files to inspect)
        if (score > 0 || scoredFiles.length < 8) {
          try {
            const content = await this.driveCapability.readFile(userId, file.id);
            if (content) {
              const lowerContent = content.toLowerCase();
              let contentMatches = 0;
              let firstMatchIndex = -1;

              for (const kw of keywords) {
                const idx = lowerContent.indexOf(kw);
                if (idx !== -1) {
                  contentMatches++;
                  if (firstMatchIndex === -1 || idx < firstMatchIndex) {
                    firstMatchIndex = idx;
                  }
                }
              }

              if (contentMatches > 0) {
                score += contentMatches * 2;
                // Extract snippet around match
                const start = Math.max(0, firstMatchIndex - 80);
                const end = Math.min(content.length, firstMatchIndex + 220);
                const snippet = (start > 0 ? '...' : '') + content.slice(start, end).trim() + (end < content.length ? '...' : '');
                scoredFiles.push({ file, score, snippet });
                continue;
              }
            }
          } catch {
            // Error reading individual file content, continue with title-only score
          }
        }

        if (score > 0) {
          scoredFiles.push({ file, score, snippet: `File: ${file.name}` });
        }
      }

      // Sort by score descending
      scoredFiles.sort((a, b) => b.score - a.score);
      const topMatches = scoredFiles.slice(0, maxResults);

      const documents: SearchDocumentResult[] = topMatches.map(item => ({
        id: item.file.id,
        title: item.file.name,
        uri: item.file.webViewLink || `https://drive.google.com/file/d/${item.file.id}/view`,
        mimeType: item.file.mimeType,
        snippets: item.snippet ? [item.snippet] : [],
        extractiveAnswers: item.snippet ? [item.snippet] : [],
        relevanceScore: item.score
      }));

      const citations = documents.map(d => ({
        sourceTitle: d.title,
        sourceUri: d.uri,
        snippet: d.snippets[0]
      }));

      let summary = undefined;
      if (documents.length > 0) {
        const topTitles = documents.map(d => `"${d.title}"`).join(', ');
        summary = `Found ${documents.length} matching document(s) in your SERA Vault: ${topTitles}. Relevant excerpts have been extracted for synthesis.`;
      } else {
        summary = `No matching documents found in your SERA Vault for query "${query}".`;
      }

      return {
        success: true,
        query,
        summary,
        documents,
        citations,
        totalResults: documents.length,
        source: 'vault_drive_fallback'
      };
    } catch (err: any) {
      console.error('[VaultIndexSyncService] Error in performDriveFallbackSearch:', err);
      return {
        success: false,
        query,
        documents: [],
        citations: [],
        totalResults: 0,
        source: 'vault_drive_fallback',
        errorMessage: err.message || 'Failed to inspect Google Drive Vault.'
      };
    }
  }
}

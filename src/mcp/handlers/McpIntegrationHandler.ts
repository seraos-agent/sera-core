import { GoogleDriveCapability } from '../../capabilities/google-drive/GoogleDriveCapability';
import { GoogleDriveConnectionRepository } from '../../core/integrations/google-drive/GoogleDriveConnectionRepository';
import { VertexSearchService } from '../../capabilities/vertex-search/VertexSearchService';
import { VaultIndexSyncService } from '../../capabilities/vertex-search/VaultIndexSyncService';

/**
 * Handles third-party ecosystem integrations (Google Drive, Sheets, Meta Threads)
 * and cognitive long-term memory operations via MCP.
 */
export class McpIntegrationHandler {
  private async getGDriveCapability(): Promise<GoogleDriveCapability> {
    const connections = GoogleDriveConnectionRepository.fromEnvironment();
    if (!connections) throw new Error('Google Drive integration not configured.');
    const capability = GoogleDriveCapability.fromEnvironment(connections);
    if (!capability) throw new Error('Google Drive capability failed to initialize.');
    return capability;
  }

  public async handleGDriveWrite(instance: any, args: Record<string, any>): Promise<any> {
    try {
      const cap = await this.getGDriveCapability();
      const fileId = await cap.writeFile(instance.sessionId || instance.userId || 'dev', args.filename, args.content, args.mimeType);
      return { content: [{ type: 'text', text: `✅ Successfully wrote ${args.filename} (ID: ${fileId}) to Google Drive SERA Vault.` }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to write to Google Drive: ${e.message}` }] };
    }
  }

  public async handleGDriveRead(instance: any, args: Record<string, any>): Promise<any> {
    try {
      const cap = await this.getGDriveCapability();
      const userId = instance.sessionId || instance.userId || 'dev';
      let targetId = args.fileId;
      if (!targetId && args.filename) {
        const files = await cap.listFiles(userId, { name: args.filename });
        if (files.length === 0) throw new Error(`File ${args.filename} not found.`);
        targetId = files[0].id;
      }
      if (!targetId) throw new Error('Must provide either filename or fileId');

      const content = await cap.readFile(userId, targetId);
      return { content: [{ type: 'text', text: `📄 Content of ${args.filename || args.fileId}:\n\n${content}` }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to read from Google Drive: ${e.message}` }] };
    }
  }

  public async handleGDriveList(instance: any, args: Record<string, any>): Promise<any> {
    try {
      const cap = await this.getGDriveCapability();
      const files = await cap.listFiles(instance.sessionId || instance.userId || 'dev', args);
      const formatted = files.length === 0
        ? 'Your SERA Vault is currently empty.'
        : files.map((f: any) => `- **${f.name}** (ID: \`${f.id}\`, Type: ${f.mimeType})`).join('\n');
      return { content: [{ type: 'text', text: `📂 Files in Google Drive SERA Vault:\n\n${formatted}` }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to list files: ${e.message}` }] };
    }
  }

  public async handleGDriveCreateSheet(instance: any, args: Record<string, any>): Promise<any> {
    try {
      const cap = await this.getGDriveCapability();
      const result = await cap.createSpreadsheet(
        instance.sessionId || instance.userId || 'dev',
        args.title,
        args.headers,
        args.rows,
        args.options,
        args.sheets
      );
      const fileId = typeof result === 'string' ? result : result.fileId;
      const webViewLink = typeof result === 'object' && result.webViewLink ? ` (${result.webViewLink})` : '';
      return { content: [{ type: 'text', text: `📊 Successfully ${typeof result === 'object' && result.isUpdate ? 'updated' : 'created'} formatted spreadsheet "${args.title}" (ID: ${fileId})${webViewLink} in Google Drive SERA Vault.` }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to create spreadsheet: ${e.message}` }] };
    }
  }

  public async handleGDriveAppend(instance: any, args: Record<string, any>): Promise<any> {
    try {
      const cap = await this.getGDriveCapability();
      const fileId = await cap.appendToFile(instance.sessionId || instance.userId || 'dev', args.filename, args.content);
      return { content: [{ type: 'text', text: `📝 Successfully appended content to "${args.filename}" (ID: ${fileId}) in Google Drive SERA Vault.` }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to append to file: ${e.message}` }] };
    }
  }

  public async handleGDriveDelete(instance: any, args: Record<string, any>): Promise<any> {
    try {
      const cap = await this.getGDriveCapability();
      await cap.deleteFile(instance.sessionId || instance.userId || 'dev', {
        filename: args.filename,
        fileId: args.fileId
      });
      return { content: [{ type: 'text', text: `🗑️ Successfully deleted "${args.filename || args.fileId}" from Google Drive SERA Vault.` }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to delete file from Google Drive: ${e.message}` }] };
    }
  }

  public async handleThreadsPublish(instance: any, userId: string, args: Record<string, any>): Promise<any> {
    const { text, imageUrl, driveFileName } = args;
    if (!text) {
      return { isError: true, content: [{ type: 'text', text: 'Post text is required.' }] };
    }

    try {
      const threadsApi = instance.runtime?.threadsApi || instance.goalBridge?.threadsApi;
      if (!threadsApi) {
        throw new Error('Threads capability is not initialized on this instance.');
      }

      let finalImageUrl = imageUrl;
      if (driveFileName) {
        const cap = await this.getGDriveCapability();
        const files = await cap.listFiles(userId, { name: driveFileName });
        if (files.length === 0) throw new Error(`Drive image ${driveFileName} not found.`);
        finalImageUrl = await cap.getPublicMediaUrl(userId, files[0].id);
      }

      const postId = await threadsApi.publishPost(userId, text.trim(), undefined, finalImageUrl);
      return {
        content: [{
          type: 'text',
          text: `🎉 Successfully published post to Meta Threads!\n\n• Post ID: \`${postId}\`\n• Text: "${text.trim()}"`
        }]
      };
    } catch (e: any) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to publish to Threads: ${e.message}` }]
      };
    }
  }

  public handleMemoryRead(instance: any): any {
    const memoryStore = instance.memoryStore;
    if (!memoryStore) {
      return { content: [{ type: 'text', text: 'Memory store is not available.' }] };
    }

    const allBeliefs = typeof memoryStore.getAllBeliefs === 'function'
      ? memoryStore.getAllBeliefs()
      : [];

    const activeBeliefs = allBeliefs.filter((b: any) => b.status === 'ACTIVE');
    if (activeBeliefs.length === 0) {
      return {
        content: [{
          type: 'text',
          text: 'Sera\'s persistent memory is currently empty. Interact with Sera to build up memories and preferences.'
        }]
      };
    }

    const formatted = activeBeliefs
      .map((b: any) => `• **${b.key}**: ${typeof b.value === 'string' ? b.value : JSON.stringify(b.value)}`)
      .join('\n');

    return {
      content: [{
        type: 'text',
        text: `**Sera Persistent Memory** (${activeBeliefs.length} active beliefs)\n\n${formatted}`
      }]
    };
  }

  public handleMemoryWrite(instance: any, args: Record<string, any>): any {
    const { key, value } = args;
    if (!key || !value) {
      return { isError: true, content: [{ type: 'text', text: 'Both key and value are required.' }] };
    }

    try {
      if (instance.memoryStore?.setBelief) {
        instance.memoryStore.setBelief(key, value);
      }
      return {
        content: [{
          type: 'text',
          text: `🧠 Successfully stored into Sera long-term memory: **${key}** = "${value}"`
        }]
      };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Failed to write memory: ${e.message}` }] };
    }
  }

  public async handleVaultDeepSearch(instance: any, args: Record<string, any>): Promise<any> {
    try {
      const cap = await this.getGDriveCapability();
      const vertexService = new VertexSearchService();
      const syncService = new VaultIndexSyncService({
        vertexSearchService: vertexService,
        googleDriveCapability: cap
      });

      const userId = instance.sessionId || instance.userId || 'dev';
      const result = await syncService.search(userId, args.query, args.pageSize || 5);

      let text = `🔍 **Deep Vault Search Results for:** "${args.query}"\n\n`;
      if (result.summary) {
        text += `**Executive Summary:**\n${result.summary}\n\n`;
      }
      if (result.documents && result.documents.length > 0) {
        text += `**Relevant Documents:**\n`;
        result.documents.forEach((d, idx) => {
          text += `${idx + 1}. [${d.title}](${d.uri || '#'}) (${d.mimeType || 'Document'})\n`;
          if (d.snippets && d.snippets[0]) {
            text += `   > ${d.snippets[0]}\n`;
          }
        });
      } else {
        text += `No matching documents found in Google Drive SERA Vault.`;
      }

      return { content: [{ type: 'text', text }] };
    } catch (e: any) {
      return { isError: true, content: [{ type: 'text', text: `Deep Vault Search failed: ${e.message}` }] };
    }
  }
}

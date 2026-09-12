import { GoogleDriveConnectionRepository } from '../../../core/integrations/google-drive/GoogleDriveConnectionRepository';

export interface FolderServiceDependencies {
  connections: GoogleDriveConnectionRepository;
  fetchImpl: typeof fetch;
  getAccessToken: (userId: string) => Promise<string>;
  listFiles: (userId: string, query?: { name?: string; mimeType?: string; searchTerm?: string; folderId?: string; exact?: boolean }) => Promise<any[]>;
}

/**
 * Manages Google Drive folder structures, hierarchy creation, folder moving/renaming,
 * and canonical SERA Vault organization (tidyVault).
 */
export class GoogleDriveFolderService {
  private folderIdCache: Map<string, Map<string, string>> = new Map();

  constructor(private readonly deps: FolderServiceDependencies) {}

  public clearCache(): void {
    this.folderIdCache.clear();
  }

  /** Gets the Vault folder ID. Creates an error if missing. */
  public async getVaultFolderId(userId: string): Promise<string> {
    const status = await this.deps.connections.getStatus(userId);
    if (status.status !== 'CONNECTED' || !status.vaultFolderId) {
      throw new Error(`Google Drive is not connected or Vault folder missing for user ${userId}`);
    }
    return status.vaultFolderId;
  }

  /**
   * Retrieves all immediate subfolder IDs inside the Vault folder.
   */
  public async getVaultSubfolderIds(userId: string, vaultFolderId: string): Promise<string[]> {
    const token = await this.deps.getAccessToken(userId);
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${vaultFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    url.searchParams.set('fields', 'files(id, name)');

    try {
      const res = await this.deps.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      return (data.files || []).map((f: any) => f.id);
    } catch {
      return [];
    }
  }

  /**
   * Ensures a single folder exists under a parent folder.
   */
  public async ensureFolder(userId: string, folderName: string, parentFolderId?: string): Promise<string> {
    const token = await this.deps.getAccessToken(userId);
    const parentId = parentFolderId || (await this.getVaultFolderId(userId));

    const cacheKey = `${userId}:${parentId}`;
    let userCache = this.folderIdCache.get(cacheKey);
    if (!userCache) {
      userCache = new Map();
      this.folderIdCache.set(cacheKey, userCache);
    }
    if (userCache.has(folderName)) {
      return userCache.get(folderName)!;
    }

    const cleanName = folderName.trim().replace(/'/g, "\\'");
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name = '${cleanName}' or name contains '${cleanName}')`);
    url.searchParams.set('fields', 'files(id, name)');

    const res = await this.deps.fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      const data = (await res.json()) as any;
      if (data.files && data.files.length > 0) {
        const id = data.files[0].id;
        userCache.set(folderName, id);
        return id;
      }
    }

    const createRes = await this.deps.fetchImpl('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      })
    });

    if (!createRes.ok) {
      throw new Error(`Failed to create folder "${folderName}": ${await createRes.text()}`);
    }

    const created = (await createRes.json()) as any;
    userCache.set(folderName, created.id);
    return created.id;
  }

  /**
   * Ensures a nested folder path (e.g. "Spreadsheets/Sales & Marketplace") exists inside SERA Vault.
   */
  public async ensureFolderPath(userId: string, folderPath: string): Promise<string> {
    if (!folderPath || folderPath.trim() === '' || folderPath === '/') {
      return this.getVaultFolderId(userId);
    }
    const segments = folderPath.split('/').map(s => s.trim()).filter(Boolean);
    let currentParentId = await this.getVaultFolderId(userId);

    for (const segment of segments) {
      currentParentId = await this.ensureFolder(userId, segment, currentParentId);
    }

    return currentParentId;
  }

  /**
   * Creates a folder inside SERA Vault (or nested inside another folder).
   */
  public async createFolder(
    userId: string,
    folderName: string,
    parentFolderNameOrId?: string
  ): Promise<{ folderId: string; folderName: string; webViewLink: string }> {
    let parentId = await this.getVaultFolderId(userId);
    if (parentFolderNameOrId && parentFolderNameOrId.trim() !== '' && parentFolderNameOrId.toLowerCase() !== 'root') {
      parentId = await this.ensureFolderPath(userId, parentFolderNameOrId);
    }
    const folderId = await this.ensureFolder(userId, folderName, parentId);
    const token = await this.deps.getAccessToken(userId);
    let webViewLink = `https://drive.google.com/drive/folders/${folderId}`;
    try {
      const res = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=webViewLink`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data.webViewLink) webViewLink = data.webViewLink;
      }
    } catch {}
    return { folderId, folderName, webViewLink };
  }

  /**
   * Renames a file or folder inside SERA Vault.
   */
  public async renameItem(
    userId: string,
    targetNameOrId: string,
    newName: string
  ): Promise<{ id: string; oldName: string; newName: string; isFolder: boolean }> {
    const token = await this.deps.getAccessToken(userId);
    let item: { id: string; name: string; mimeType: string } | null = null;

    // Check by exact file ID first
    try {
      const res = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${targetNameOrId}?fields=id,name,mimeType,trashed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (!data.trashed) item = data;
      }
    } catch {}

    if (!item) {
      // Search files in SERA Vault
      const files = await this.deps.listFiles(userId, { name: targetNameOrId });
      if (files.length > 0) {
        item = files[0];
      } else {
        // Also check if it matches a subfolder
        const cleanName = targetNameOrId.replace(/'/g, "\\'");
        const url = new URL('https://www.googleapis.com/drive/v3/files');
        url.searchParams.set('q', `mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name = '${cleanName}' or name contains '${cleanName}')`);
        url.searchParams.set('fields', 'files(id, name, mimeType)');
        const fRes = await this.deps.fetchImpl(url.toString(), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (fRes.ok) {
          const fData = (await fRes.json()) as any;
          if (fData.files && fData.files.length > 0) item = fData.files[0];
        }
      }
    }

    if (!item) {
      throw new Error(`File or folder "${targetNameOrId}" was not found in your SERA Vault.`);
    }

    const originalName = item.name;

    const patchRes = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${item.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: newName })
    });

    if (!patchRes.ok) {
      throw new Error(`Failed to rename "${originalName}": ${await patchRes.text()}`);
    }

    const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
    if (isFolder) {
      this.folderIdCache.clear();
    }

    return {
      id: item.id,
      oldName: originalName,
      newName,
      isFolder
    };
  }

  /**
   * Moves a file or folder into a destination folder in SERA Vault using Google Drive addParents / removeParents.
   */
  public async moveItem(
    userId: string,
    itemNameOrId: string,
    destinationFolderNameOrId: string
  ): Promise<{ id: string; name: string; destinationFolder: string; webViewLink?: string }> {
    const token = await this.deps.getAccessToken(userId);
    let item: { id: string; name: string; parents?: string[]; mimeType: string } | null = null;

    // Try finding by direct ID
    try {
      const res = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${itemNameOrId}?fields=id,name,parents,mimeType,trashed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (!data.trashed) item = data;
      }
    } catch {}

    if (!item) {
      const files = await this.deps.listFiles(userId, { name: itemNameOrId });
      if (files.length > 0) {
        item = files[0];
        if (!item?.parents) {
          const pRes = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${item!.id}?fields=id,name,parents,mimeType`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (pRes.ok) item = (await pRes.json()) as any;
        }
      }
    }

    if (!item) {
      throw new Error(`Item "${itemNameOrId}" was not found in your SERA Vault.`);
    }

    // Resolve destination folder ID
    let targetFolderId: string;
    let targetFolderName = destinationFolderNameOrId;
    const destLower = destinationFolderNameOrId.trim().toLowerCase();
    if (destLower === 'root' || destLower === 'sera vault' || destLower === '/') {
      targetFolderId = await this.getVaultFolderId(userId);
      targetFolderName = 'SERA Vault';
    } else {
      targetFolderId = await this.ensureFolderPath(userId, destinationFolderNameOrId);
    }

    const prevParents = (item.parents || []).join(',');
    let moveUrl = `https://www.googleapis.com/drive/v3/files/${item.id}?addParents=${targetFolderId}&fields=id,name,parents,webViewLink`;
    if (prevParents) {
      moveUrl += `&removeParents=${prevParents}`;
    }

    const moveRes = await this.deps.fetchImpl(moveUrl, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!moveRes.ok) {
      throw new Error(`Failed to move "${item.name}": ${await moveRes.text()}`);
    }

    const movedData = (await moveRes.json()) as any;
    return {
      id: item.id,
      name: item.name,
      destinationFolder: targetFolderName,
      webViewLink: movedData.webViewLink
    };
  }

  /**
   * Safely deletes or trashes a folder inside SERA Vault.
   */
  public async deleteFolder(
    userId: string,
    folderNameOrId: string,
    permanent: boolean = false
  ): Promise<{ id: string; name: string; trashed: boolean; permanent: boolean }> {
    const token = await this.deps.getAccessToken(userId);
    let folder: { id: string; name: string; mimeType: string } | null = null;

    try {
      const res = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${folderNameOrId}?fields=id,name,mimeType,trashed`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = (await res.json()) as any;
        if (!data.trashed && data.mimeType === 'application/vnd.google-apps.folder') folder = data;
      }
    } catch {}

    if (!folder) {
      const cleanName = folderNameOrId.replace(/'/g, "\\'");
      const url = new URL('https://www.googleapis.com/drive/v3/files');
      url.searchParams.set('q', `mimeType = 'application/vnd.google-apps.folder' and trashed = false and (name = '${cleanName}' or name contains '${cleanName}')`);
      url.searchParams.set('fields', 'files(id, name, mimeType)');
      const fRes = await this.deps.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (fRes.ok) {
        const fData = (await fRes.json()) as any;
        if (fData.files && fData.files.length > 0) folder = fData.files[0];
      }
    }

    if (!folder) {
      throw new Error(`Folder "${folderNameOrId}" was not found in your SERA Vault.`);
    }

    const vaultId = await this.getVaultFolderId(userId);
    if (folder.id === vaultId) {
      throw new Error('Cannot delete the root SERA Vault folder.');
    }

    if (permanent) {
      const delRes = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${folder.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!delRes.ok && delRes.status !== 204) {
        throw new Error(`Failed to delete folder "${folder.name}": ${await delRes.text()}`);
      }
    } else {
      const trashRes = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${folder.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ trashed: true })
      });
      if (!trashRes.ok) {
        throw new Error(`Failed to move folder "${folder.name}" to trash: ${await trashRes.text()}`);
      }
    }

    this.folderIdCache.clear();

    return {
      id: folder.id,
      name: folder.name,
      trashed: !permanent,
      permanent
    };
  }

  /**
   * Scans uncategorized files sitting at the root of SERA Vault and moves them
   * into their designated canonical folders (Media, Spreadsheets, Reports).
   */
  public async tidyVault(userId: string): Promise<{ movedCount: number; items: Array<{ name: string; destinationFolder: string }> }> {
    const token = await this.deps.getAccessToken(userId);
    const vaultId = await this.getVaultFolderId(userId);

    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${vaultId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`);
    url.searchParams.set('fields', 'files(id, name, mimeType, parents)');
    url.searchParams.set('pageSize', '100');

    const res = await this.deps.fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error(`Failed to scan root vault files: ${await res.text()}`);
    }

    const data = (await res.json()) as { files?: Array<{ id: string; name: string; mimeType: string; parents?: string[] }> };
    const files = data.files || [];
    const movedItems: Array<{ name: string; destinationFolder: string }> = [];

    for (const file of files) {
      const lowerName = file.name.toLowerCase();
      let targetFolder = 'Reports & Research';

      if (
        file.mimeType.startsWith('image/') ||
        file.mimeType.startsWith('video/') ||
        lowerName.endsWith('.jpg') ||
        lowerName.endsWith('.jpeg') ||
        lowerName.endsWith('.png') ||
        lowerName.endsWith('.webp') ||
        lowerName.endsWith('.gif') ||
        lowerName.endsWith('.mp4') ||
        lowerName.endsWith('.mov') ||
        lowerName.endsWith('.webm')
      ) {
        targetFolder = 'Media & Creative';
      } else if (
        file.mimeType === 'application/vnd.google-apps.spreadsheet' ||
        file.mimeType.includes('spreadsheet') ||
        lowerName.endsWith('.xlsx') ||
        lowerName.endsWith('.xls') ||
        lowerName.endsWith('.csv')
      ) {
        targetFolder = 'Spreadsheets & Analysis';
      } else if (lowerName.includes('system') || lowerName.includes('memory') || lowerName.includes('log')) {
        targetFolder = 'System Core';
      }

      try {
        await this.moveItem(userId, file.id, targetFolder);
        movedItems.push({ name: file.name, destinationFolder: targetFolder });
      } catch (err: any) {
        console.warn(`[GoogleDriveFolderService] Warning moving "${file.name}" during tidy:`, err.message);
      }
    }

    return {
      movedCount: movedItems.length,
      items: movedItems
    };
  }
}

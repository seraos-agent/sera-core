import { uploadMediaToSupabase, cleanupCdnMedia } from '../../../server/routes/mediaRoutes';

export interface MediaServiceDependencies {
  fetchImpl: typeof fetch;
  getAccessToken: (userId: string) => Promise<string>;
  ensureFolderPath: (userId: string, folderPath: string) => Promise<string>;
  writeBuffer: (userId: string, name: string, buffer: Buffer, mimeType: string, targetFolderId?: string) => Promise<string>;
  readBuffer: (userId: string, fileIdOrName: string) => Promise<Buffer>;
  listFiles: (userId: string, query?: { name?: string; mimeType?: string; searchTerm?: string; folderId?: string; exact?: boolean }) => Promise<any[]>;
}

/**
 * Handles image and video persistence in Google Drive, as well as the
 * ephemeral 24-hour CDN media bridge for Threads/social media crawlers.
 */
export class GoogleDriveMediaService {
  // 24-hour Smart Cache for bridged media to enable zero-latency reposting and reduce egress
  private static bridgeCache = new Map<string, {
    publicUrl: string;
    mimeType: string;
    isVideo: boolean;
    fileKey: string;
    filename: string;
    cachedAt: number;
  }>();
  public static readonly BRIDGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private readonly deps: MediaServiceDependencies) {}

  /**
   * Saves an attached image or video (from chat attachment, dataUrl, or buffer)
   * into the user's Google Drive SERA Vault (defaults to "🎨 Media & Creative").
   */
  public async saveMedia(
    userId: string,
    filename: string,
    mediaData: string | Buffer,
    mimeType?: string,
    folderName: string = '🎨 Media & Creative'
  ): Promise<{ fileId: string; filename: string; webViewLink: string; folder: string; isVideo: boolean }> {
    let buffer: Buffer;
    let detectedMime = mimeType || '';

    if (Buffer.isBuffer(mediaData)) {
      buffer = mediaData;
    } else if (typeof mediaData === 'string') {
      if (mediaData.startsWith('data:')) {
        const matches = mediaData.match(/^data:([A-Za-z-+\/0-9.]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          if (!detectedMime) detectedMime = matches[1].toLowerCase();
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(mediaData.replace(/^data:[^,]+,/, ''), 'base64');
        }
      } else if (mediaData.startsWith('http://') || mediaData.startsWith('https://')) {
        const res = await this.deps.fetchImpl(mediaData);
        if (!res.ok) throw new Error(`Failed to download media from URL: ${res.statusText}`);
        if (!detectedMime) detectedMime = res.headers.get('content-type') || '';
        const arrayBuf = await res.arrayBuffer();
        buffer = Buffer.from(arrayBuf);
      } else {
        buffer = Buffer.from(mediaData, 'base64');
      }
    } else {
      throw new Error('Invalid media data provided for saving to Google Drive.');
    }

    const lowerName = filename.toLowerCase();
    if (!detectedMime) {
      if (lowerName.endsWith('.mp4')) detectedMime = 'video/mp4';
      else if (lowerName.endsWith('.mov')) detectedMime = 'video/quicktime';
      else if (lowerName.endsWith('.webm')) detectedMime = 'video/webm';
      else if (lowerName.endsWith('.png')) detectedMime = 'image/png';
      else if (lowerName.endsWith('.webp')) detectedMime = 'image/webp';
      else detectedMime = 'image/jpeg';
    }

    const isVideo = detectedMime.startsWith('video/');
    const targetFolderId = await this.deps.ensureFolderPath(userId, folderName);
    const fileId = await this.deps.writeBuffer(userId, filename, buffer, detectedMime, targetFolderId);

    const token = await this.deps.getAccessToken(userId);
    let webViewLink = `https://drive.google.com/file/d/${fileId}/view`;
    try {
      const res = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink,name`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const meta = (await res.json()) as any;
        if (meta.webViewLink) webViewLink = meta.webViewLink;
      }
    } catch {
      // Continue with default view link
    }

    return {
      fileId,
      filename,
      webViewLink,
      folder: folderName,
      isVideo
    };
  }

  /**
   * Ephemeral Media Bridge: Reads a media file from Google Drive and uploads it
   * to the public Supabase CDN bridge so Meta Threads crawler can stream it directly.
   */
  public async bridgeDriveMediaToCdn(
    userId: string,
    filenameOrId: string
  ): Promise<{ publicUrl: string; mimeType: string; isVideo: boolean; fileKey: string; filename: string }> {
    let targetId = filenameOrId;
    let targetName = filenameOrId;

    const files = await this.deps.listFiles(userId, { name: filenameOrId });
    if (files.length > 0) {
      targetId = files[0].id;
      targetName = files[0].name || filenameOrId;
    } else {
      try {
        const token = await this.deps.getAccessToken(userId);
        const metaRes = await this.deps.fetchImpl(`https://www.googleapis.com/drive/v3/files/${filenameOrId}?fields=id,name,mimeType`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (metaRes.ok) {
          const meta = (await metaRes.json()) as any;
          targetId = meta.id;
          targetName = meta.name || filenameOrId;
        } else {
          throw new Error(`Media file "${filenameOrId}" was not found in your SERA Vault.`);
        }
      } catch {
        throw new Error(`Media file "${filenameOrId}" was not found in your SERA Vault.`);
      }
    }

    // Check 24-hour Smart Cache
    const cacheKey = `${userId}:${targetId}`;
    const cached = GoogleDriveMediaService.bridgeCache.get(cacheKey);
    if (cached) {
      if (Date.now() - cached.cachedAt < GoogleDriveMediaService.BRIDGE_TTL_MS) {
        console.log(`[GoogleDriveMediaService] CDN bridge cache HIT for "${targetName}" (ID: ${targetId}). Reusing cached CDN URL.`);
        return {
          publicUrl: cached.publicUrl,
          mimeType: cached.mimeType,
          isVideo: cached.isVideo,
          fileKey: cached.fileKey,
          filename: cached.filename
        };
      } else {
        cleanupCdnMedia(cached.fileKey).catch(() => {});
        GoogleDriveMediaService.bridgeCache.delete(cacheKey);
      }
    }

    const buffer = await this.deps.readBuffer(userId, targetId);

    let mimeType = 'image/jpeg';
    const lower = targetName.toLowerCase();
    if (lower.endsWith('.mp4')) mimeType = 'video/mp4';
    else if (lower.endsWith('.mov')) mimeType = 'video/quicktime';
    else if (lower.endsWith('.webm')) mimeType = 'video/webm';
    else if (lower.endsWith('.png')) mimeType = 'image/png';
    else if (lower.endsWith('.webp')) mimeType = 'image/webp';

    const uploadRes = await uploadMediaToSupabase(buffer, mimeType, targetName, userId, 'bridge');

    const result = {
      publicUrl: uploadRes.url,
      mimeType: uploadRes.mimeType,
      isVideo: uploadRes.isVideo,
      fileKey: uploadRes.fileKey,
      filename: targetName
    };

    GoogleDriveMediaService.bridgeCache.set(cacheKey, {
      ...result,
      cachedAt: Date.now()
    });

    GoogleDriveMediaService.sweepExpiredBridgeCache();

    return result;
  }

  public static sweepExpiredBridgeCache(): void {
    const now = Date.now();
    for (const [key, entry] of GoogleDriveMediaService.bridgeCache.entries()) {
      if (now - entry.cachedAt >= GoogleDriveMediaService.BRIDGE_TTL_MS) {
        cleanupCdnMedia(entry.fileKey).catch(() => {});
        GoogleDriveMediaService.bridgeCache.delete(key);
      }
    }
  }

  public async cleanupCdnBridge(fileKey: string, force: boolean = false): Promise<boolean> {
    if (!force) {
      return true;
    }
    for (const [key, entry] of GoogleDriveMediaService.bridgeCache.entries()) {
      if (entry.fileKey === fileKey) {
        GoogleDriveMediaService.bridgeCache.delete(key);
        break;
      }
    }
    return cleanupCdnMedia(fileKey);
  }
}

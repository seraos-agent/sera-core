import { Router, Request, Response } from 'express';

/**
 * Uploads a raw media buffer directly to the public Supabase storage bucket 'sera_chat_attachments'.
 * Returns the direct public CDN URL and the storage file key.
 */
export async function uploadMediaToSupabase(
  buffer: Buffer,
  mimeType: string,
  filename?: string,
  sessionId?: string,
  subFolder?: string
): Promise<{ success: boolean; url: string; fileKey: string; mimeType: string; isVideo: boolean }> {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const isVideo = mimeType.startsWith('video/');

  let ext = mimeType.split('/')[1] || (isVideo ? 'mp4' : 'png');
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'quicktime') ext = 'mov';
  if (ext.includes(';')) ext = ext.split(';')[0];

  const safeSession = (sessionId || 'anonymous').toLowerCase().replace(/[^a-z0-9]/g, '');
  const prefix = subFolder ? `${subFolder}/${safeSession}` : safeSession;
  const fileKey = `${prefix}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

  if (supabaseUrl && supabaseKey) {
    try {
      const uploadRes = await fetch(`${supabaseUrl}/storage/v1/object/sera_chat_attachments/${fileKey}`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          authorization: `Bearer ${supabaseKey}`,
          'content-type': mimeType
        },
        body: new Uint8Array(buffer)
      });

      if (uploadRes.ok) {
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/sera_chat_attachments/${fileKey}`;
        return {
          success: true,
          url: publicUrl,
          fileKey,
          mimeType,
          isVideo
        };
      } else {
        const errTxt = await uploadRes.text();
        console.warn('[Server] Supabase media upload failed:', errTxt);
      }
    } catch (err: any) {
      console.warn('[Server] Supabase media upload error:', err.message);
    }
  }

  // Fallback if Supabase credentials are not configured (local dev)
  const base64Url = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return {
    success: true,
    url: base64Url,
    fileKey,
    mimeType,
    isVideo
  };
}

/**
 * Deletes a temporary media file from Supabase Storage by its fileKey or public URL.
 */
export async function cleanupCdnMedia(fileKeyOrUrl: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !supabaseKey || !fileKeyOrUrl) return false;

  let key = fileKeyOrUrl;
  if (key.includes('/storage/v1/object/public/sera_chat_attachments/')) {
    key = key.split('/storage/v1/object/public/sera_chat_attachments/')[1];
  } else if (key.includes('/storage/v1/object/sera_chat_attachments/')) {
    key = key.split('/storage/v1/object/sera_chat_attachments/')[1];
  }

  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/object/sera_chat_attachments`, {
      method: 'DELETE',
      headers: {
        apikey: supabaseKey,
        authorization: `Bearer ${supabaseKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({ prefixes: [key] })
    });
    return res.ok;
  } catch (err: any) {
    console.warn('[Server] Failed to delete CDN media key:', key, err.message);
    return false;
  }
}

export function createMediaRouter(): Router {
  const router = Router();

  const handleMediaUpload = async (req: Request, res: Response) => {
    try {
      const { dataUrl, filename, sessionId } = req.body;
      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ error: 'Missing image data' });
      }

      const matches = dataUrl.match(/^data:([A-Za-z-+\/0-9.]+);base64,(.+)$/);
      let buffer: Buffer;
      let mimeType = 'image/png';

      if (matches && matches.length === 3) {
        mimeType = matches[1].toLowerCase();
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(dataUrl, 'base64');
        if (filename && filename.toLowerCase().endsWith('.mp4')) mimeType = 'video/mp4';
        else if (filename && filename.toLowerCase().endsWith('.mov')) mimeType = 'video/quicktime';
        else if (filename && filename.toLowerCase().endsWith('.webm')) mimeType = 'video/webm';
        else mimeType = 'image/png';
      }

      const uploadResult = await uploadMediaToSupabase(buffer, mimeType, filename, sessionId);

      return res.json({
        success: true,
        url: uploadResult.url,
        fileKey: uploadResult.fileKey,
        filename: filename || uploadResult.fileKey,
        mimeType: uploadResult.mimeType,
        isVideo: uploadResult.isVideo
      });
    } catch (err: any) {
      console.error('[Server] Media upload error:', err.message);
      res.status(500).json({ error: err.message });
    }
  };

  // Modern media upload route (Supports both photos and videos)
  router.post('/api/upload/media', handleMediaUpload);

  // Backward-compatible image upload route
  router.post('/api/upload/image', handleMediaUpload);

  return router;
}

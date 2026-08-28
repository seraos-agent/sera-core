import { Router, Request, Response } from 'express';

export function createMediaRouter(): Router {
  const router = Router();

  // ── Image Upload Route (Multimodal Chat & Social Media) ─────────────────────
  router.post('/api/upload/image', async (req: Request, res: Response) => {
    try {
      const { dataUrl, filename, sessionId } = req.body;
      if (!dataUrl || typeof dataUrl !== 'string') {
        return res.status(400).json({ error: 'Missing image data' });
      }

      const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer: Buffer;
      let mimeType = 'image/png';
      let ext = 'png';

      if (matches && matches.length === 3) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
        ext = mimeType.split('/')[1] || 'png';
        if (ext === 'jpeg') ext = 'jpg';
      } else {
        buffer = Buffer.from(dataUrl, 'base64');
      }

      const safeSession = (sessionId || 'anonymous').toLowerCase().replace(/[^a-z0-9]/g, '');
      const fileKey = `${safeSession}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
      const supabaseKey = process.env.SUPABASE_SECRET_KEY;

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
            return res.json({
              success: true,
              url: publicUrl,
              filename: filename || fileKey,
              mimeType
            });
          } else {
            const errTxt = await uploadRes.text();
            console.warn('[Server] Supabase image upload failed:', errTxt);
          }
        } catch (err: any) {
          console.warn('[Server] Supabase upload error:', err.message);
        }
      }

      return res.json({
        success: true,
        url: dataUrl,
        filename: filename || 'image.png',
        mimeType
      });
    } catch (err: any) {
      console.error('[Server] /api/upload/image error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

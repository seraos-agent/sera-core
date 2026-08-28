import { describe, it, expect } from 'vitest';
import express from 'express';
import { createMediaRouter } from '../src/server/routes/mediaRoutes';

describe('Media Routes (/api/upload/image)', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use(createMediaRouter());
  });

  it('rejects image upload when dataUrl is missing with 400', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/upload/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('Missing image data');
    } finally {
      server.close();
    }
  });

  it('successfully accepts base64 image data payload', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    const base64Data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/upload/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: base64Data,
          filename: 'pixel.png',
          sessionId: 'user-test'
        })
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.filename).toBe('pixel.png');
      expect(body.mimeType).toBe('image/png');
    } finally {
      server.close();
    }
  });
});

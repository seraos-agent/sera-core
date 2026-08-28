import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createGoogleDriveRouter } from '../src/server/routes/googleDriveRoutes';

describe('Google Drive OAuth Routes', () => {
  let app: express.Express;
  let mockIO: any;

  beforeEach(() => {
    mockIO = {
      to: vi.fn().mockReturnValue({ emit: vi.fn() })
    };
    app = express();
  });

  it('returns 503 when Google Drive OAuth service is null', async () => {
    app.use(createGoogleDriveRouter(null, mockIO));
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/google-drive/callback`);
      expect(res.status).toBe(503);
      const text = await res.text();
      expect(text).toContain('Google Drive is not configured');
    } finally {
      server.close();
    }
  });

  it('returns 400 when callback is missing code or state parameters', async () => {
    const mockService = {
      completeAuthorization: vi.fn()
    };
    app.use(createGoogleDriveRouter(mockService as any, mockIO));
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/google-drive/callback?code=abc`);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain('Google Drive was not connected');
    } finally {
      server.close();
    }
  });

  it('successfully completes authorization and emits status to user room', async () => {
    const mockService = {
      completeAuthorization: vi.fn().mockResolvedValue({
        userId: 'user-charlie',
        status: { provider: 'GOOGLE_DRIVE', status: 'CONNECTED' }
      })
    };
    app.use(createGoogleDriveRouter(mockService as any, mockIO));
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/auth/google-drive/callback?code=test-code&state=test-state`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('Google Drive connected');
      expect(mockService.completeAuthorization).toHaveBeenCalledWith('test-code', 'test-state');
      expect(mockIO.to).toHaveBeenCalledWith('user:user-charlie');
    } finally {
      server.close();
    }
  });
});

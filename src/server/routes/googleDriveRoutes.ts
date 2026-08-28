import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { GoogleDriveOAuthService } from '../../core/integrations/google-drive/GoogleDriveOAuthService';

export function renderGoogleDriveCallbackPage(title: string, message: string, isSuccess: boolean): string {
  const color = isSuccess ? '#28795B' : '#B23B3B';
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]!));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F7F4;color:#18221D;font-family:Inter,system-ui,sans-serif"><main style="width:min(90vw,440px);padding:32px;border:1px solid #D9DDD6;border-radius:18px;background:#FFF"><div style="color:${color};font-weight:700;font-size:12px;letter-spacing:.08em">SERA GOOGLE DRIVE</div><h1 style="font-size:24px;margin:12px 0">${escapeHtml(title)}</h1><p style="color:#58635B;line-height:1.55;margin:0">${escapeHtml(message)}</p><p style="color:#58635B;font-size:13px;margin:20px 0 0">You can close this window.</p></main><script>window.opener?.postMessage({type:'sera:google-drive:complete',success:${isSuccess}}, '*');</script></body></html>`;
}

export function createGoogleDriveRouter(
  googleDriveOAuthService: GoogleDriveOAuthService | null,
  io: SocketIOServer
): Router {
  const router = Router();

  router.get('/auth/google-drive/callback', async (request: Request, response: Response) => {
    if (!googleDriveOAuthService) {
      response.status(503).type('html').send(renderGoogleDriveCallbackPage('Google Drive is not configured', 'SERA Core is missing its Google Drive OAuth configuration.', false));
      return;
    }

    const code = typeof request.query.code === 'string' ? request.query.code : undefined;
    const state = typeof request.query.state === 'string' ? request.query.state : undefined;
    const authorizationError = typeof request.query.error === 'string' ? request.query.error : undefined;
    if (authorizationError || !code || !state) {
      response.status(400).type('html').send(renderGoogleDriveCallbackPage('Google Drive was not connected', authorizationError || 'The authorization response was incomplete.', false));
      return;
    }

    try {
      const completed = await googleDriveOAuthService.completeAuthorization(code, state);
      io.to(`user:${completed.userId}`).emit('google_drive:status', completed.status);
      response.type('html').send(renderGoogleDriveCallbackPage('Google Drive connected', 'Your SERA Vault folder is ready. SERA stores only validated memory projections there.', true));
    } catch (error) {
      console.error('[GoogleDrive] OAuth callback failed:', error);
      const message = error instanceof Error ? error.message : 'The connection could not be completed.';
      response.status(400).type('html').send(renderGoogleDriveCallbackPage('Google Drive was not connected', message, false));
    }
  });

  return router;
}

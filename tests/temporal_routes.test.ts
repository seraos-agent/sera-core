import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { createTemporalRouter } from '../src/server/routes/temporalRoutes';

describe('Temporal Routes (/api/temporal/tick)', () => {
  let app: express.Express;
  let mockAgentManager: any;
  let mockSupabaseClient: any;

  beforeEach(() => {
    mockAgentManager = {
      hydrateAllSessionsFromCloud: vi.fn().mockResolvedValue(3),
      emitGlobalTemporalTick: vi.fn().mockReturnValue({ instancesTicked: 3 })
    };
    mockSupabaseClient = {};

    app = express();
    app.use(express.json());
    app.use(createTemporalRouter(mockAgentManager, mockSupabaseClient));
  });

  it('rejects tick request without cron secret with 401', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/temporal/tick`, { method: 'POST' });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain('Unauthorized');
      expect(mockAgentManager.emitGlobalTemporalTick).not.toHaveBeenCalled();
    } finally {
      server.close();
    }
  });

  it('accepts authorized tick request with x-cron-key header and triggers hydration', async () => {
    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/temporal/tick`, {
        method: 'POST',
        headers: {
          'x-cron-key': process.env.CRON_SECRET || 'sera-temporal-cron-key-2026'
        }
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.sessionsHydrated).toBe(3);
      expect(body.activeInstances).toBe(3);
      expect(mockAgentManager.hydrateAllSessionsFromCloud).toHaveBeenCalled();
      expect(mockAgentManager.emitGlobalTemporalTick).toHaveBeenCalled();
    } finally {
      server.close();
    }
  });
});

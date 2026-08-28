import { Router, Request, Response } from 'express';
import { AgentManager } from '../AgentManager';
import { Runtime } from '../../runtime/Runtime';
import { SupabaseRestClient } from '../../core/persistence/SupabaseRestClient';

export function createTemporalRouter(
  agentManager: AgentManager,
  supabaseClient: SupabaseRestClient | null
): Router {
  const router = Router();

  // ── Canonical Temporal Heartbeat Endpoint (Cloud Scheduler Trigger) ─────────
  router.all('/api/temporal/tick', async (req: Request, res: Response) => {
    const cronKey = req.headers['x-cron-key'] || req.query.key || (req.headers.authorization ? req.headers.authorization.replace('Bearer ', '') : undefined);
    const expectedKey = process.env.CRON_SECRET || 'sera-temporal-cron-key-2026';

    if (cronKey !== expectedKey) {
      return res.status(401).json({ error: 'Unauthorized: Invalid cron key' });
    }

    const nowUtc = Date.now();

    // 1. Ensure all user sessions with triggers/state in Supabase are active in memory
    let hydrated = 0;
    try {
      hydrated = await agentManager.hydrateAllSessionsFromCloud(supabaseClient);
    } catch (err: any) {
      console.warn('[Server] Temporal tick hydration warning:', err.message);
    }

    // 2. Emit canonical tick to all running instances
    const tickResult = agentManager.emitGlobalTemporalTick();

    // 3. Trigger autonomous Threads poll
    try {
      const daemon = Runtime.getGlobalThreadsDaemon();
      if (daemon) {
        void daemon.pollNow();
      }
    } catch (err: any) {
      console.warn('[Server] Temporal tick Threads poll error:', err.message);
    }

    return res.json({
      success: true,
      timestampUtc: nowUtc,
      timeIso: new Date(nowUtc).toISOString(),
      sessionsHydrated: hydrated,
      activeInstances: tickResult.instancesTicked
    });
  });

  return router;
}

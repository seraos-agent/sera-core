import { EventEmitter } from 'events';
import { TriggerEngine } from '../../core/triggers/TriggerEngine';
import { AutonomyAgreementStore } from '../../core/autonomy/AutonomyAgreementStore';
import { StandardEvent, EventTypes } from '../../core/events/types';
import { EmitResultFn } from './types';

/**
 * TriggerGoalHandler — Manages scheduled goals, timers, recurring cron triggers, and autonomy agreements.
 */
export class TriggerGoalHandler {
  constructor(
    private readonly triggerEngine: TriggerEngine | undefined,
    private readonly autonomyAgreementStore: AutonomyAgreementStore | undefined,
    private readonly eventBus: EventEmitter,
    private readonly sessionId: string,
    private readonly emitResult: EmitResultFn,
    private readonly requestContextMap: Map<string, { _responseContext?: any; _userMessage?: any }>
  ) {}

  public handleActivateAutonomyAgreement(requestId: string, parameters: Record<string, any>): void {
    if (!this.autonomyAgreementStore) throw new Error('Autonomy Agreement store is not initialized.');
    const mode = parameters.mode === 'FULL_ACCESS' ? 'FULL_ACCESS' : 'ASSISTANT';
    const permissions = Array.isArray(parameters.permissions)
      ? parameters.permissions.filter((permission): permission is string => typeof permission === 'string' && permission.length > 0)
      : [];
    const agreement = this.autonomyAgreementStore.activate({
      principalId: this.sessionId,
      title: String(parameters.title || '').trim(),
      intent: String(parameters.intent || '').trim(),
      mode,
      permissions,
      nextActionSummary: typeof parameters.nextActionSummary === 'string' ? parameters.nextActionSummary : undefined
    });
    this.eventBus.emit(EventTypes.AUTONOMY_AGREEMENT_ACTIVATED, {
      id: `evt-agreement-${Date.now()}`,
      type: EventTypes.AUTONOMY_AGREEMENT_ACTIVATED,
      source: 'GoalBridge',
      timestamp: Date.now(),
      payload: { agreement }
    } as StandardEvent);
    this.emitResult(requestId, true, {
      agreement,
      message: 'Operating Agreement is active.',
      _userMessage: typeof parameters._userMessage === 'string' ? parameters._userMessage : undefined
    });
  }

  public async handleScheduleGoal(requestId: string, parameters: Record<string, any>): Promise<void> {
    if (!this.triggerEngine) {
      this.emitResult(requestId, false, {}, 'TriggerEngine is not initialized');
      return;
    }

    let { scheduleType, humanIntent, cronExpression, executeAfterUtc, delaySeconds, actionIntent, actionParameters } = parameters;

    // Relative Interval Extraction & Cron Normalization
    let computedIntervalMs: number | undefined = undefined;
    let sanitizedCron = cronExpression ? cronExpression.trim() : undefined;

    if (scheduleType === 'cron' || parameters.intervalHours || parameters.intervalMinutes || parameters.intervalMs) {
      if (parameters.intervalMs && Number(parameters.intervalMs) > 0) {
        computedIntervalMs = Number(parameters.intervalMs);
      } else if (parameters.intervalHours && Number(parameters.intervalHours) > 0) {
        computedIntervalMs = Number(parameters.intervalHours) * 3600 * 1000;
      } else if (parameters.intervalMinutes && Number(parameters.intervalMinutes) > 0) {
        computedIntervalMs = Number(parameters.intervalMinutes) * 60 * 1000;
      } else if (sanitizedCron) {
        const parts = sanitizedCron.split(/\s+/);
        if (parts.length === 6) {
          sanitizedCron = '*/1 * * * *';
        } else if (parts.length < 5) {
          sanitizedCron = '*/5 * * * *';
        } else if (parts.length === 5) {
          if (parts[0] === '*/60') {
            parts[0] = '0';
            sanitizedCron = parts.join(' ');
          }
          if (parts[0] === '*' && parts[1].includes('/')) {
            parts[0] = '0';
            sanitizedCron = parts.join(' ');
          }
        }

        // Check for relative interval patterns
        const mMin = sanitizedCron.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);
        const mHourStep = sanitizedCron.match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
        const mHourEvery = sanitizedCron.match(/^0\s+\*\s+\*\s+\*\s+\*$/);

        if (mMin) {
          computedIntervalMs = Math.max(60000, parseInt(mMin[1]) * 60 * 1000);
        } else if (mHourStep) {
          computedIntervalMs = Math.max(3600000, parseInt(mHourStep[1]) * 3600 * 1000);
        } else if (mHourEvery) {
          computedIntervalMs = 3600000; // 1 hour
        }
      } else {
        computedIntervalMs = 300000; // Default: 5 minutes
      }
    }

    let computedExecuteAfterUtc = executeAfterUtc;
    if (scheduleType === 'exact' && delaySeconds !== undefined) {
      const safeDelay = Math.max(10, Number(delaySeconds));
      computedExecuteAfterUtc = new Date(Date.now() + safeDelay * 1000).toISOString();
    } else if (scheduleType === 'exact' && !executeAfterUtc) {
      // Fallback: If LLM forgets to pass delaySeconds for exact schedule, default to 60 seconds
      computedExecuteAfterUtc = new Date(Date.now() + 60000).toISOString();
    }

    // Preserve origin response context (e.g. WhatsApp, Telegram, or Web UI) so scheduled reminders know their destination channel
    const originContext = parameters._responseContext ||
                          parameters.responseContext ||
                          this.requestContextMap.get(requestId)?._responseContext;

    const triggerId = `trg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newTrigger = {
      id: triggerId,
      type: 'TIME' as const,
      state: 'ACTIVE' as const,
      firePolicy: scheduleType === 'cron' ? ('REPEAT' as const) : ('ONCE' as const),
      condition: {
        type: scheduleType === 'cron' ? ('RECURRING' as const) : ('EXACT' as const),
        humanIntent: humanIntent || 'Recurring schedule',
        timezoneContext: 'UTC (Global)',
        internalCompiled: sanitizedCron,
        intervalMs: computedIntervalMs,
        executeAfterUtc: scheduleType === 'exact' ? computedExecuteAfterUtc : undefined,
      },
      action: {
        type: actionIntent,
        payload: {
          ...(actionParameters || {}),
          ...(originContext ? {
            _responseContext: originContext,
            platform: (actionParameters && actionParameters.platform) || originContext.platform,
            channelId: (actionParameters && actionParameters.channelId) || originContext.channelId,
          } : {})
        }
      },
      createdAt: Date.now()
    };

    this.triggerEngine.register(newTrigger);

    // Emit event so the server socket and Active Intent Stream update in real-time
    this.eventBus.emit('system.trigger.registered', {
      id: `evt-trg-reg-${Date.now()}`,
      type: 'system.trigger.registered',
      source: 'GoalBridge',
      timestamp: Date.now(),
      payload: newTrigger
    });

    this.emitResult(requestId, true, { scheduled: true, humanIntent, actionIntent, triggerId });
  }
}

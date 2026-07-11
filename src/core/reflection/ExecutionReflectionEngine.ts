import { ExecutionTraceStore } from '../execution/ExecutionTraceStore';
import { MemoryStore } from '../../memory/MemoryStore';
import { Belief } from '../../memory/types';
import { ExecutionPolicy } from '../execution/aios_types';
import { Logger } from '../logging/Logger';

export class ExecutionReflectionEngine {
  private logger = new Logger('ExecutionReflectionEngine');
  private readonly HIGH_LATENCY_THRESHOLD_MS = 10000;
  private readonly REPEATED_FAILURE_THRESHOLD = 3;

  constructor(
    private traceStore: ExecutionTraceStore,
    private memoryStore: MemoryStore
  ) {}

  public evaluate(): void {
    this.logger.debug('Evaluating Execution Traces for Adaptive Execution...');
    
    // Get all traces (in a real system, we would only look at recent or un-analyzed traces)
    const traces = this.traceStore.getAll();
    if (traces.length === 0) return;

    const toolStats = new Map<string, { failures: number, totalLatency: number, latencyCount: number }>();

    for (const trace of traces) {
      for (const tool of trace.toolCalls) {
        if (!toolStats.has(tool)) {
          toolStats.set(tool, { failures: 0, totalLatency: 0, latencyCount: 0 });
        }
        
        const stats = toolStats.get(tool)!;
        
        // Check for failures
        if (trace.finalOutcome === 'FAILED') {
          stats.failures++;
        }

        // Check for latency
        const start = trace.timeline.find(t => t.state === 'RUNNING');
        const end = trace.timeline.find(t => t.state === 'COMPLETED');
        
        if (start && end) {
          stats.totalLatency += (end.timestamp - start.timestamp);
          stats.latencyCount++;
        }
      }
    }

    for (const [tool, stats] of toolStats.entries()) {
      const avgLatency = stats.latencyCount > 0 ? stats.totalLatency / stats.latencyCount : 0;
      
      let adaptedPolicy: Partial<ExecutionPolicy> | null = null;
      let reason = '';

      if (stats.failures >= this.REPEATED_FAILURE_THRESHOLD) {
        // High failure rate: lower retries to save resources, or increase backoff
        adaptedPolicy = {
          retry: { maxRetries: 0, initialDelayMs: 5000, backoffMultiplier: 2, maxDelayMs: 30000 }
        };
        reason = `Repeated failures (${stats.failures} times). Adjusting policy to reduce retries.`;
      } else if (avgLatency > this.HIGH_LATENCY_THRESHOLD_MS) {
        // High latency: increase timeout
        adaptedPolicy = {
          timeout: { timeoutMs: 60000 }
        };
        reason = `High average latency (${avgLatency.toFixed(0)}ms). Increasing timeout.`;
      }

      if (adaptedPolicy) {
        this.proposeAdaptation(tool, adaptedPolicy, reason);
      }
    }
  }

  private proposeAdaptation(toolId: string, policyChanges: Partial<ExecutionPolicy>, reason: string) {
    const adaptationContent = JSON.stringify({
      toolId,
      policy: policyChanges,
      reason
    });

    // Check if we already proposed this exact adaptation recently
    const existing = this.memoryStore.getBeliefsByCategory('EXECUTION_POLICY_ADAPTATION')
      .find(b => b.key === `adaptation:${toolId}`);

    if (existing && existing.content === adaptationContent) {
      return; // Already adapted
    }

    const belief: Belief = {
      id: `adapt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      category: 'EXECUTION_POLICY_ADAPTATION',
      key: `adaptation:${toolId}`,
      content: adaptationContent,
      epistemicStatus: 'CONFIRMED',
      confidence: 1.0,
      evidenceIds: [],
      contradictionIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.memoryStore.storeBelief(belief);
    this.logger.info(`Formulated Execution Policy Adaptation for ${toolId}: ${reason}`);
  }
}

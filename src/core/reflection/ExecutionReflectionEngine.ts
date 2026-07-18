import { ExecutionTraceStore } from '../execution/ExecutionTraceStore';
import { IWorkingMemory } from '../memory/IWorkingMemory';
import { Belief } from '../../memory/types';
import { ExecutionPolicy } from '../execution/aios_types';
import { Logger } from '../logging/Logger';
import { EventEmitter } from 'events';
import { EventTypes, StandardEvent } from '../events/types';
import { MemoryOperation, MemoryProposal } from '../memory/MemoryProposal';
import { MemorySource } from '../memory/MemorySource';
import { EvidenceType } from '../memory/MemoryEvidence';

export class ExecutionReflectionEngine {
  private logger = new Logger('ExecutionReflectionEngine');
  private readonly HIGH_LATENCY_THRESHOLD_MS = 10000;
  private readonly REPEATED_FAILURE_THRESHOLD = 3;

  constructor(
    private traceStore: ExecutionTraceStore,
    private memoryStore: IWorkingMemory,
    private eventBus: EventEmitter
  ) {}

  private requestMemory(proposal: MemoryProposal): void {
    this.eventBus.emit(EventTypes.MEMORY_PROPOSAL_REQUESTED, {
      id: `evt-execution-reflection-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type: EventTypes.MEMORY_PROPOSAL_REQUESTED,
      source: 'ExecutionReflectionEngine',
      timestamp: Date.now(),
      payload: proposal
    } as StandardEvent<MemoryProposal>);
  }

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

    const supportingTraceIds = this.traceStore.getAll()
      .filter(trace => trace.toolCalls.includes(toolId))
      .map(trace => trace.id)
      .sort()
      .join(',');

    this.requestMemory({
      operation: existing ? MemoryOperation.UPDATE : MemoryOperation.CREATE,
      key: `adaptation:${toolId}`,
      value: adaptationContent,
      source: MemorySource.REFLECTION_INFERENCE,
      confidence: 1.0,
      category: 'EXECUTION_POLICY_ADAPTATION',
      evidence: {
        type: EvidenceType.EXECUTION_TRACE,
        referenceId: `execution-reflection:${toolId}:${supportingTraceIds}`,
        timestamp: Date.now()
      }
    });
    this.logger.info(`Formulated Execution Policy Adaptation for ${toolId}: ${reason}`);
  }
}

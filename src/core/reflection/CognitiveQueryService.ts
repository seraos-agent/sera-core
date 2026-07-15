import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { ExecutionTraceStore } from '../execution/ExecutionTraceStore';
import { MetaEvaluationHistory } from '../meta/MetaEvaluationHistory';
import { ExecutionTrace } from '../execution/types';
import { Belief, MemoryCategory } from '../memory/types';
import { MetaEvaluationReport } from '../meta/types';

export class CognitiveQueryService {
  constructor(
    private memoryStore: IWorkingMemory,
    private traceStore: ExecutionTraceStore,
    private metaHistory: MetaEvaluationHistory
  ) {}

  getRecentTraces(limit: number = 100): ExecutionTrace[] {
    const all = this.traceStore.getAll();
    return all.slice(Math.max(all.length - limit, 0));
  }
  
  getFailedTracesByTool(toolId: string): ExecutionTrace[] {
    return this.traceStore.query({ toolId, finalOutcome: 'FAILED' });
  }

  getFailedTraces(): ExecutionTrace[] {
    return this.traceStore.query({ finalOutcome: 'FAILED' });
  }
  
  getAllBeliefs(): Belief[] {
    return this.memoryStore.getAllBeliefs();
  }

  getRecentMetaReports(limit: number = 10): MetaEvaluationReport[] {
    const all = this.metaHistory.getHistory();
    return all.slice(Math.max(all.length - limit, 0));
  }
}

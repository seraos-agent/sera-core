import { AdaptationProposal, ExecutionTrace } from './types';
import { AdaptationValidator } from './AdaptationValidator';
import { MutationEngine } from './MutationEngine';

export class AdaptationExecutor {
  private traces: ExecutionTrace[] = [];

  constructor(
    private validator: AdaptationValidator,
    private mutationEngine: MutationEngine
  ) {}

  public executeProposal(
    proposal: AdaptationProposal,
    currentSystemState: { coherenceScore: number },
    mutationPayload: Record<string, any>
  ): ExecutionTrace {
    console.log(`[AdaptationExecutor] Commencing execution pipeline for proposal ${proposal.id}`);

    // 1. Pre-Execution Validator
    const isValid = this.validator.validatePreExecution(proposal, currentSystemState);
    if (!isValid) {
      console.log(`[AdaptationExecutor] Pre-execution validation failed for ${proposal.id}. Aborting.`);
      const trace: ExecutionTrace = {
        id: `trace-${Date.now()}`,
        proposalId: proposal.id,
        timestamp: Date.now(),
        status: 'FAILED',
        mutations: [],
        error: 'Pre-execution validation failed (Stale/Drift/Coherence).'
      };
      this.traces.push(trace);
      
      if (proposal.status !== 'STALE_REQUIRES_REEVALUATION') {
        proposal.status = 'EXECUTION_FAILED';
      }
      return trace;
    }

    // 2. Execution Sandbox
    const mutations = this.mutationEngine.executeMutationBatch(proposal.id, proposal.target.subsystem, mutationPayload);
    
    if (!mutations) {
      console.log(`[AdaptationExecutor] Mutation sandbox execution failed or rolled back for ${proposal.id}.`);
      const trace: ExecutionTrace = {
        id: `trace-${Date.now()}`,
        proposalId: proposal.id,
        timestamp: Date.now(),
        status: 'ROLLED_BACK',
        mutations: [],
        error: 'Mutation batch failed to apply. System state rolled back.'
      };
      this.traces.push(trace);
      proposal.status = 'EXECUTION_FAILED';
      return trace;
    }

    // 3. Success
    console.log(`[AdaptationExecutor] Execution successful for ${proposal.id}.`);
    const trace: ExecutionTrace = {
      id: `trace-${Date.now()}`,
      proposalId: proposal.id,
      timestamp: Date.now(),
      status: 'SUCCESS',
      mutations
    };
    this.traces.push(trace);
    proposal.status = 'EXECUTED';
    
    return trace;
  }

  public getTraces(): ExecutionTrace[] {
    return this.traces;
  }
}

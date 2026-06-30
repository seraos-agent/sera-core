import { AdaptationProposal } from './types';
import { AdaptationPlanner } from './AdaptationPlanner';

export class AdaptationValidator {
  constructor(private planner: AdaptationPlanner) {}

  public validatePreExecution(proposal: AdaptationProposal, currentSystemState: { coherenceScore: number }): boolean {
    console.log(`[AdaptationValidator] Validating pre-execution constraints for proposal ${proposal.id}`);

    // 1. Check if proposal was already executed or expired
    if (proposal.status !== 'APPROVED') {
      console.log(`[AdaptationValidator] Validation failed: Proposal status is ${proposal.status}, expected APPROVED.`);
      return false;
    }

    // 2. Evidence Drift Revalidation Doctrine (Right before execution)
    const isConsistent = this.planner.validateEvidenceSnapshotConsistency(proposal);
    if (!isConsistent) {
      console.log(`[AdaptationValidator] Validation failed: Evidence drift detected.`);
      return false;
    }

    // 3. System Coherence Check (Don't mutate during crisis)
    if (currentSystemState.coherenceScore < 0.4) {
      console.log(`[AdaptationValidator] Validation failed: System coherence (${currentSystemState.coherenceScore}) is too low to safely adapt.`);
      return false;
    }

    console.log(`[AdaptationValidator] Proposal ${proposal.id} passed all pre-execution checks.`);
    return true;
  }
}

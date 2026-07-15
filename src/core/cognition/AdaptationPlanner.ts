import { IWorkingMemory } from '../../core/memory/IWorkingMemory';
import { AdaptationProposal, GovernancePattern, AdaptationTarget } from './types';

export class AdaptationPlanner {
  private activeProposals: AdaptationProposal[] = [];
  private generationMode: 'ACTIVE' | 'COOLDOWN' = 'ACTIVE';
  private cooldownUntil: number = 0;

  constructor(private memoryStore: IWorkingMemory) {}

  public registerPendingProposal(proposal: AdaptationProposal) {
    this.activeProposals.push(proposal);
  }

  public removeExpiredProposals() {
    const now = Date.now();
    for (const proposal of this.activeProposals) {
      if (proposal.status === 'PENDING_REVIEW' && proposal.expiresAt < now) {
        console.log(`[AdaptationPlanner] Proposal expired: ${proposal.id}`);
        proposal.status = 'EXPIRED';
      }
    }
    // Clean up non-pending proposals from active tracking
    this.activeProposals = this.activeProposals.filter(p => p.status === 'PENDING_REVIEW');
    
    // Check if cooldown has expired
    if (this.generationMode === 'COOLDOWN' && Date.now() > this.cooldownUntil) {
      console.log(`[AdaptationPlanner] Cooldown expired. Resuming ACTIVE mode.`);
      this.generationMode = 'ACTIVE';
    }
  }

  public validateEvidenceSnapshotConsistency(proposal: AdaptationProposal): boolean {
    const allBeliefs = this.memoryStore.getAllBeliefs();
    const currentPatterns = allBeliefs
      .filter(b => proposal.evidenceSnapshot.patternIds.includes(b.id))
      .map(b => JSON.parse(b.content) as GovernancePattern);

    const currentObservationCount = currentPatterns.reduce((sum, p) => sum + (p.observations || 0), 0);
    // If we lost more than 10% of observations (e.g. memory eviction), or patterns disappeared
    if (currentObservationCount < proposal.evidenceSnapshot.observationCount * 0.9) {
      console.log(`[AdaptationPlanner] Evidence drift detected for proposal ${proposal.id}`);
      proposal.status = 'STALE_REQUIRES_REEVALUATION';
      return false;
    }
    return true;
  }

  private generateFingerprint(target: AdaptationTarget, proposedChange: string): string {
    const data = `${target.subsystem}:${target.scope}:${proposedChange}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `fp-${Math.abs(hash)}`;
  }

  public generateProposal(
    target: AdaptationTarget,
    proposedChange: string,
    rationale: string,
    expectedBenefit: string,
    riskAssessment: string,
    impactLevel: 'LOW' | 'MEDIUM' | 'HIGH',
    supportingPatternIds: string[]
  ): AdaptationProposal | null {
    // 1. Adaptation Proposal Uniqueness Doctrine
    const fingerprint = this.generateFingerprint(target, proposedChange);
    const isDuplicate = this.activeProposals.some(
      p => p.proposalFingerprint === fingerprint && p.status === 'PENDING_REVIEW'
    );

    if (isDuplicate) {
      console.log(`[AdaptationPlanner] Duplicate blocked: Proposal for ${target.subsystem} already pending.`);
      return null;
    }

    // 1b. Proposal Saturation Guard Doctrine
    const problemSignature = `${target.subsystem}-perf-issue`; // Simplified mapping for the problem
    const activeProposalCount = this.activeProposals.filter(
      p => p.problemSignature === problemSignature && p.status === 'PENDING_REVIEW'
    ).length;

    if (activeProposalCount >= 2) {
      console.log(`[AdaptationPlanner] Saturation Guard triggered for problem: ${problemSignature}. Entering COOLDOWN.`);
      this.generationMode = 'COOLDOWN';
      this.cooldownUntil = Date.now() + 10 * 60 * 1000; // 10 minutes cooldown
      return null;
    }

    if (this.generationMode === 'COOLDOWN') {
      console.log(`[AdaptationPlanner] Currently in COOLDOWN mode. Blocking generation.`);
      return null;
    }

    // 2. Adaptation Evidence Snapshot Doctrine
    const allBeliefs = this.memoryStore.getAllBeliefs();
    const supportingPatterns = allBeliefs
      .filter(b => supportingPatternIds.includes(b.id))
      .map(b => JSON.parse(b.content) as GovernancePattern);

    const patternIds = supportingPatterns.map(p => p.id);
    const observationCount = supportingPatterns.reduce((sum, p) => sum + (p.observations || 0), 0);
    // Dummy extraction of calibration states for snapshot
    const calibrationStates = ['OVERCONFIDENT'];

    const evidenceSnapshot = {
      patternIds,
      calibrationStates,
      observationCount
    };

    // 3. Adaptation Proposal Expiration Doctrine
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const expiresAt = now + SEVEN_DAYS;

    const proposal: AdaptationProposal = {
      id: `adapt-${now}-${Math.floor(Math.random() * 1000)}`,
      target,
      proposedChange,
      rationale,
      supportingBeliefIds: patternIds,
      evidenceSnapshot,
      proposalFingerprint: fingerprint,
      problemSignature,
      expectedBenefit,
      riskAssessment,
      confidence: 0.8 + (Math.min(observationCount, 100) / 100) * 0.15, // Max 0.95 based on evidence
      impactLevel,
      status: 'PENDING_REVIEW',
      createdAt: now,
      expiresAt
    };

    console.log(`[AdaptationPlanner] Generated new AdaptationProposal: ${proposal.id}`);
    
    return proposal;
  }
}

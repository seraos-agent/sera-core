import { MemoryProposal, MemoryOperation } from './MemoryProposal';
import { MemoryPolicy } from './MemoryPolicy';
import { MemoryStatus } from './MemoryItem';
import { VerificationLevel } from './VerificationLevel';
import { MemorySource } from './MemorySource';
import { IWorkingMemory } from './IWorkingMemory';
import { EpistemicStatus } from './types';

export class MemoryPolicyEngine {
  private memoryService: IWorkingMemory;
  private policies: Map<string, MemoryPolicy> = new Map();

  constructor(memoryService: IWorkingMemory) {
    this.memoryService = memoryService;
    this.loadDefaultPolicies();
    console.log('[MemoryPolicyEngine] Initialized.');
  }

  private loadDefaultPolicies() {
    // Default fallback policy
    this.policies.set('*', {
      namespace: '*',
      minimumVerification: VerificationLevel.UNVERIFIED,
      requireEvidence: true,
      minConfidenceForAutoConfirm: 0.7,
      protectedKeys: ['system.version']
    });

    // High security namespace
    this.policies.set('wallet', {
      namespace: 'wallet',
      minimumVerification: VerificationLevel.SYSTEM_OBSERVED,
      requireEvidence: true,
      minConfidenceForAutoConfirm: 0.9,
      protectedKeys: ['wallet.address', 'wallet.privateKey']
    });
  }

  private getPolicyFor(key: string): MemoryPolicy {
    const namespace = key.split('.')[0];
    return this.policies.get(namespace) || this.policies.get('*')!;
  }

  public evaluate(proposal: MemoryProposal): { approved: boolean; reason?: string } {
    const policy = this.getPolicyFor(proposal.key);

    // 1. Check Protected Keys
    if (policy.protectedKeys.includes(proposal.key)) {
      if (proposal.source === MemorySource.REFLECTION_INFERENCE || proposal.source === MemorySource.USER_STATEMENT || proposal.source === MemorySource.USER_DIRECT_INSTRUCTION) {
        console.log(`[MemoryPolicyEngine] REJECTED: Protected key ${proposal.key} cannot be modified by unverified sources.`);
        return { approved: false, reason: 'Protected key cannot be modified by unverified sources.' };
      }
    }

    // 2. Check Evidence Requirement
    if (policy.requireEvidence && !proposal.evidence) {
      console.log(`[MemoryPolicyEngine] REJECTED: Missing evidence for ${proposal.key}.`);
      return { approved: false, reason: 'Policy requires evidence for this memory modification.' };
    }

    // 3. Conflict Resolution with Existing Memory
    const existing = this.memoryService.getBeliefByKey(proposal.key);
    
    let proposedVerification = VerificationLevel.UNVERIFIED;
    if (proposal.source === MemorySource.BLOCKCHAIN_OBSERVATION || proposal.source === MemorySource.SYSTEM_EVENT) {
      proposedVerification = VerificationLevel.SYSTEM_OBSERVED;
    }
    else if (proposal.source === MemorySource.USER_STATEMENT || proposal.source === MemorySource.USER_DIRECT_INSTRUCTION) proposedVerification = VerificationLevel.USER_CONFIRMED;

    let newStatus = MemoryStatus.ACTIVE;
    
    if (existing && existing.status === MemoryStatus.ACTIVE) {
      const existingWeight = this.getVerificationWeight(existing.verificationLevel || VerificationLevel.UNVERIFIED);
      const proposedWeight = this.getVerificationWeight(proposedVerification);

      if (proposedWeight < existingWeight) {
        console.log(`[MemoryPolicyEngine] REJECTED: Proposed weight (${proposedWeight}) < Existing weight (${existingWeight}) for ${proposal.key}.`);
        return { approved: false, reason: 'Proposed memory has lower verification weight than existing belief.' };
      }
      
      if (proposedWeight === existingWeight) {
        const proposedContent = typeof proposal.value === 'string' ? proposal.value : JSON.stringify(proposal.value);
        if (existing.content !== proposedContent) {
           console.log(`[MemoryPolicyEngine] CONFLICT DETECTED: Equal weight for ${proposal.key}. Moving to PENDING state.`);
           newStatus = MemoryStatus.PENDING;
        }
      }
    }

    // 4. Check Confidence Threshold
    if (proposal.confidence < policy.minConfidenceForAutoConfirm) {
      newStatus = MemoryStatus.PENDING; // Needs manual confirmation via Dialogue
    }

    // 5. Epistemic status is decided by policy, never by the event producer.
    // Reflection output remains a hypothesis until it is independently supported.
    const evidenceIds = new Set(existing?.evidenceIds || []);
    evidenceIds.add(proposal.evidence.referenceId);
    const epistemicStatus = this.resolveEpistemicStatus(
      proposal,
      newStatus,
      proposedVerification,
      evidenceIds.size
    );

    // 6. Execute Mutation securely
    this.memoryService.__mutate_protected(proposal, newStatus, proposedVerification, epistemicStatus);

    return { approved: true };
  }

  private getVerificationWeight(level: VerificationLevel): number {
    switch (level) {
      case VerificationLevel.EXTERNALLY_VERIFIED: return 40;
      case VerificationLevel.SYSTEM_OBSERVED: return 30;
      case VerificationLevel.USER_CONFIRMED: return 20;
      case VerificationLevel.UNVERIFIED: return 10;
      default: return 0;
    }
  }

  private resolveEpistemicStatus(
    proposal: MemoryProposal,
    status: MemoryStatus,
    verification: VerificationLevel,
    evidenceCount: number
  ): EpistemicStatus {
    if (status === MemoryStatus.PENDING) return 'HYPOTHESIS';

    const categoryIsRecordedFact = [
      'GOVERNANCE_DECISION_RECORD',
      'GOVERNANCE_OUTCOME_RECORD',
      'GOVERNANCE_PATTERN_RECORD'
    ].includes(proposal.category || '');

    if (proposal.key.startsWith('wallet.') && verification === VerificationLevel.SYSTEM_OBSERVED) {
      return 'VERIFIED_SENSITIVE';
    }

    if (
      proposal.source === MemorySource.BLOCKCHAIN_OBSERVATION ||
      proposal.source === MemorySource.SYSTEM_EVENT ||
      categoryIsRecordedFact
    ) {
      return 'CONFIRMED';
    }

    if (proposal.source === MemorySource.USER_DIRECT_INSTRUCTION && proposal.confidence >= 0.7) {
      return 'CONFIRMED';
    }

    if (
      proposal.source === MemorySource.REFLECTION_INFERENCE &&
      evidenceCount >= 3 &&
      proposal.confidence >= 0.7
    ) {
      return 'CONFIRMED';
    }

    return 'HYPOTHESIS';
  }
}

import { MemoryProposal, MemoryOperation } from './MemoryProposal';
import { MemoryPolicy } from './MemoryPolicy';
import { MemoryStatus } from './MemoryItem';
import { VerificationLevel } from './VerificationLevel';
import { MemorySource } from './MemorySource';

export interface IMemoryServiceAdapter {
  get(key: string): any;
  __mutate_protected(proposal: MemoryProposal, newStatus: MemoryStatus, verification: VerificationLevel): any;
}

export class MemoryPolicyEngine {
  private memoryService: IMemoryServiceAdapter;
  private policies: Map<string, MemoryPolicy> = new Map();

  constructor(memoryService: IMemoryServiceAdapter) {
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
      if (proposal.source === MemorySource.REFLECTION_INFERENCE || proposal.source === MemorySource.USER_STATEMENT) {
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
    const existing = this.memoryService.get(proposal.key);
    
    let proposedVerification = VerificationLevel.UNVERIFIED;
    if (proposal.source === MemorySource.BLOCKCHAIN_OBSERVATION) proposedVerification = VerificationLevel.SYSTEM_OBSERVED;
    else if (proposal.source === MemorySource.USER_STATEMENT) proposedVerification = VerificationLevel.USER_CONFIRMED;

    if (existing && existing.status === MemoryStatus.ACTIVE) {
      const existingWeight = this.getVerificationWeight(existing.verificationLevel);
      const proposedWeight = this.getVerificationWeight(proposedVerification);

      if (proposedWeight < existingWeight) {
        console.log(`[MemoryPolicyEngine] REJECTED: Proposed weight (${proposedWeight}) < Existing weight (${existingWeight}) for ${proposal.key}.`);
        return { approved: false, reason: 'Proposed memory has lower verification weight than existing belief.' };
      }
    }

    // 4. Check Confidence Threshold
    let newStatus = MemoryStatus.ACTIVE;
    if (proposal.confidence < policy.minConfidenceForAutoConfirm) {
      newStatus = MemoryStatus.PENDING; // Needs manual confirmation via Dialogue
    }

    // 5. Execute Mutation securely
    this.memoryService.__mutate_protected(proposal, newStatus, proposedVerification);

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
}

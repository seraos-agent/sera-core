import { SubsystemRegistrar, AdaptableSubsystem } from './SubsystemRegistrar';
import { MutationContext } from './types';

export class MutationEngine {
  constructor(private registrar: SubsystemRegistrar) {}

  public executeMutationBatch(proposalId: string, subsystemId: string, mutations: Record<string, any>): MutationContext[] | null {
    console.log(`[MutationEngine] Starting execution for proposal ${proposalId} on ${subsystemId}`);
    
    const subsystem = this.registrar.getSubsystem(subsystemId);
    if (!subsystem) {
      console.log(`[MutationEngine] ERROR: Subsystem ${subsystemId} not registered or not adaptable.`);
      return null;
    }

    const appliedMutations: MutationContext[] = [];
    const keys = Object.keys(mutations);

    // Sandbox execution: Apply and rollback if any fail
    for (const key of keys) {
      const proposedValue = mutations[key];
      const originalValue = subsystem.getOriginalValue(key);

      // Validate
      if (!subsystem.validateMutation(key, proposedValue)) {
        console.log(`[MutationEngine] Validation failed for key ${key} with value ${proposedValue}. Initiating rollback.`);
        this.rollback(subsystem, appliedMutations);
        return null; // Return null to indicate complete failure
      }

      try {
        subsystem.applyMutation(key, proposedValue);
        appliedMutations.push({
          subsystem: subsystemId,
          configKey: key,
          originalValue,
          proposedValue,
          proposalId
        });
        console.log(`[MutationEngine] Applied ${key} = ${proposedValue} (was ${originalValue})`);
      } catch (error) {
        console.log(`[MutationEngine] Error applying mutation to ${key}. Initiating rollback.`, error);
        this.rollback(subsystem, appliedMutations);
        return null;
      }
    }

    return appliedMutations;
  }

  private rollback(subsystem: AdaptableSubsystem, appliedMutations: MutationContext[]) {
    console.log(`[MutationEngine] Rolling back ${appliedMutations.length} mutations on ${subsystem.id}`);
    // Roll back in reverse order
    for (let i = appliedMutations.length - 1; i >= 0; i--) {
      const mut = appliedMutations[i];
      try {
        subsystem.applyMutation(mut.configKey, mut.originalValue);
        console.log(`[MutationEngine] Rolled back ${mut.configKey} to ${mut.originalValue}`);
      } catch (error) {
        console.log(`[MutationEngine] CRITICAL FAILURE during rollback of ${mut.configKey}! System state may be corrupted.`);
      }
    }
  }
}

import { VerificationLevel } from './VerificationLevel';

export interface MemoryPolicy {
  namespace: string;
  minimumVerification: VerificationLevel;
  requireEvidence: boolean;
  minConfidenceForAutoConfirm: number;
  protectedKeys: string[];
}

import { MemorySource } from '../core/memory/MemorySource';
import { VerificationLevel } from '../core/memory/VerificationLevel';
import { MemoryStatus } from '../core/memory/MemoryItem';

export type MemoryCategory = 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL' | 'RELATIONAL' | 'INTENT_REALIZATION' | 'OUTCOME_REALIZATION' | 'CALIBRATION' | 'GOVERNANCE_DECISION_RECORD' | 'GOVERNANCE_OUTCOME_RECORD' | 'GOVERNANCE_PATTERN_RECORD' | 'GOAL_INTELLIGENCE_RECORD' | 'GOAL_GRAPH_RECORD' | 'GOAL_TENSION_RECORD' | 'GOAL_DRIFT_RECORD' | 'GOAL_INTERPRETATION_RECORD' | 'SELF_MODEL_SNAPSHOT';
export type EpistemicStatus = 'HYPOTHESIS' | 'CONFIRMED' | 'VERIFIED_SENSITIVE';

export interface Belief {
  id: string;
  category: MemoryCategory;
  
  // Fields merged from MemoryItem for policy engine compatibility
  key?: string;
  status?: MemoryStatus;
  source?: MemorySource;
  verificationLevel?: VerificationLevel;
  
  content: string;
  epistemicStatus: EpistemicStatus;
  confidence: number; // 0.0 to 1.0
  evidenceIds: string[];
  contradictionIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type MemoryCategory = 'EPISODIC' | 'SEMANTIC' | 'PROCEDURAL' | 'RELATIONAL' | 'INTENT_REALIZATION' | 'OUTCOME_REALIZATION' | 'CALIBRATION' | 'GOVERNANCE_DECISION_RECORD';
export type EpistemicStatus = 'HYPOTHESIS' | 'CONFIRMED' | 'VERIFIED_SENSITIVE';

export interface Belief {
  id: string;
  category: MemoryCategory;
  content: string;
  epistemicStatus: EpistemicStatus;
  confidence: number; // 0.0 to 1.0
  evidenceIds: string[];
  contradictionIds: string[];
  createdAt: number;
  updatedAt: number;
}

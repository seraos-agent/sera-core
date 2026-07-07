import { MemoryEvidence } from './MemoryEvidence';

export type ExperienceType = 'CONVERSATION' | 'GOAL_EXECUTION' | 'SYSTEM_EVENT';

export interface ExperienceRecord {
  /** Unique ID for the experience episode */
  id: string;
  
  /** When this experience was finalized/consolidated */
  timestamp: number;
  
  /** The type of experience */
  type: ExperienceType;
  
  /** A concise, human-readable semantic summary of the episode (e.g., "User asked to transfer 10 USDC, and the action was successful.") */
  summary: string;
  
  /** The collection of raw evidence (Event IDs, Tx Hashes, etc.) that make up this experience */
  evidence: MemoryEvidence[];
  
  /** Any unstructured cognitive metadata useful for clustering/reflection later */
  metadata?: Record<string, any>;
}

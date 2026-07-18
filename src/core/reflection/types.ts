import { MemoryCategory } from '../memory/types';

export interface ReflectionPattern {
  id: string;
  type: 
    | 'REPEATED_FAILURE' 
    | 'REPEATED_SUCCESS' 
    | 'GOVERNANCE_CONFLICT' 
    | 'PERFORMANCE_DEGRADATION' 
    | 'RESOURCE_INEFFICIENCY';
  confidence: number;
  supportingTraceIds: string[];
  description: string;
}

export interface BeliefUpdateProposal {
  id: string;
  action: 'PROPOSE_HYPOTHESIS' | 'ADD_EVIDENCE' | 'ADD_CONTRADICTION';
  confidence: number;
  evidenceIds: string[]; // Usually supportingTraceIds from the pattern
  reasoning: string;
  
  // Specific to hypothesis
  content?: string;
  category?: MemoryCategory;
  
  // Specific to evidence/contradiction
  beliefId?: string;
}

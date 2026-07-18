import { MemorySource } from './MemorySource';
import { MemoryEvidence } from './MemoryEvidence';
import { MemoryCategory } from './types';

export enum MemoryOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CONFIRM = 'CONFIRM',
  INVALIDATE = 'INVALIDATE'
}

export interface MemoryProposal {
  operation: MemoryOperation;
  key: string;
  value: any;
  evidence: MemoryEvidence;
  contradictionId?: string;
  confidence: number;
  source: MemorySource;
  category?: MemoryCategory;
}

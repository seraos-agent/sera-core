import { MemorySource } from './MemorySource';
import { MemoryEvidence } from './MemoryEvidence';

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
  confidence: number;
  source: MemorySource;
}

import { MemorySource } from './MemorySource';
import { VerificationLevel } from './VerificationLevel';
import { MemoryEvidence } from './MemoryEvidence';

export enum MemoryStatus {
  ACTIVE = 'ACTIVE',
  SUPERSEDED = 'SUPERSEDED',
  INVALIDATED = 'INVALIDATED',
  PENDING = 'PENDING'
}

export interface MemoryItem {
  id: string;
  key: string;
  value: any;
  status: MemoryStatus;
  source: MemorySource;
  evidence: MemoryEvidence;
  confidence: number;
  verificationLevel: VerificationLevel;
  createdAt: number;
  updatedAt: number;
}

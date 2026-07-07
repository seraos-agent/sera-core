export enum EvidenceType {
  USER_MESSAGE = 'USER_MESSAGE',
  DOMAIN_EVENT = 'DOMAIN_EVENT',
  EXECUTION_TRACE = 'EXECUTION_TRACE',
  REFLECTION_PATTERN = 'REFLECTION_PATTERN',
  EXTERNAL_SOURCE = 'EXTERNAL_SOURCE'
}

export interface MemoryEvidence {
  type: EvidenceType;
  referenceId: string;
  timestamp: number;
}

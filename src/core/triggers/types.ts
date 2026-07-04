export interface TemporalCondition {
  type: 'EXACT' | 'RECURRING';
  humanIntent: string;       // e.g. "every monday 9AM"
  timezoneContext: string;   // e.g. "UTC+7"
  internalCompiled?: string; // Optional compiler output (e.g. cron string)
  executeAfterUtc?: number;  // For EXACT matching
}

export interface TriggerAction {
  type: string;
  targetId?: string; // e.g. specific wallet or goal ID
  payload: Record<string, any>;
}

export interface Trigger {
  id: string;
  type: 'TIME' | 'EVENT' | 'SYSTEM';
  state: 'ACTIVE' | 'PAUSED' | 'FIRING' | 'DISABLED';
  firePolicy: 'ONCE' | 'REPEAT' | 'CONDITIONAL';
  condition: TemporalCondition | any;
  action: TriggerAction;
  createdAt: number;
  lastFiredAt?: number;
  lastExecutionResult?: {
    success: boolean;
    errorMessage?: string;
  };
}

export interface TriggerStore {
  save(trigger: Trigger): void;
  get(id: string): Trigger | undefined;
  delete(id: string): void;
  getActiveTriggers(): Trigger[];
  getAll(): Trigger[];
}

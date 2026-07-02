export interface Event {
  id: string;
  type: string;
  payload: Record<string, any>;
  timestamp: number;
}

// ── Canonical SERA Event Types ─────────────────────────────────────────────
export const EventTypes = {
  // Dialogue Layer
  USER_OBSERVATION: 'USER_OBSERVATION',
  AGENT_SPEAK: 'AGENT_SPEAK',
  ACTIVITY: 'ACTIVITY',

  // UI Control
  UI_COMMAND: 'UI_COMMAND',

  // Agentic Goal Bridge
  SPAWN_GOAL: 'SPAWN_GOAL',
  GOAL_RESULT: 'GOAL_RESULT',
  WALLET_STATE: 'WALLET_STATE',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

// ── Typed Payload Interfaces ───────────────────────────────────────────────
export interface SpawnGoalPayload {
  requestId: string;       // ties result back to the originating dialogue turn
  intent: string;          // e.g. 'CHECK_WALLET_BALANCE', 'TRANSFER_FUNDS'
  parameters: Record<string, any>;
}

export interface GoalResultPayload {
  requestId: string;
  success: boolean;
  data: Record<string, any>;
  errorMessage?: string;
}

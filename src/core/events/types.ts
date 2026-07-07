/**
 * The standard envelope for all events in SERA's Event-Driven Architecture.
 */
export interface StandardEvent<T = any> {
  id: string;                    // UUID of the event
  type: string;                  // Ontology string (e.g., 'dialogue.user.observed')
  source: string;                // Who emitted this event (e.g., 'TriggerEngine', 'DialogueEngine')
  correlationId?: string;        // Optional trace ID that follows asynchronous flows
  timestamp: number;             // Unix timestamp
  payload: T;                    // Strongly typed payload
}

// For backward compatibility during migration, alias Event to StandardEvent
export type Event = StandardEvent;

// ── SERA Unified Event Ontology ──────────────────────────────────────────────

export const EventTypes = {
  // System Domain
  SYSTEM_BOOT: 'system.boot',
  SYSTEM_TRIGGER_FIRED: 'system.trigger.fired',
  SYSTEM_CYCLE_COMPLETED: 'system.cycle.completed',
  TRIGGER_SEMANTIC_REFLECTION: 'system.trigger.semantic_reflection',
  SYSTEM_PROPOSE_GOAL: 'system.propose.goal',

  // Dialogue Domain
  DIALOGUE_USER_OBSERVED: 'dialogue.user.observed',
  DIALOGUE_AGENT_SPEAK: 'dialogue.agent.speak',
  DIALOGUE_ACTIVITY: 'dialogue.activity',
  DIALOGUE_PROPOSAL_GENERATED: 'dialogue.proposal.generated',
  DIALOGUE_PROPOSAL_APPROVED: 'dialogue.proposal.approved',
  DIALOGUE_PROPOSAL_REJECTED: 'dialogue.proposal.rejected',

  // Domain / Execution Layer
  DOMAIN_GOAL_SPAWNED: 'domain.goal.spawned',
  DOMAIN_GOAL_RESULT: 'domain.goal.result',
  DOMAIN_WALLET_STATE: 'domain.wallet.state',
  DOMAIN_ACTION_DISPATCHED: 'domain.action.dispatched',
  
  // Temporal Layer
  TEMPORAL_TICK: 'temporal.tick',
  
  // Perception Domain
  COGNITIVE_OBSERVATION: 'perception.cognitive.observation',

  // UI Layer
  UI_COMMAND: 'ui.command',
} as const;

export type EventType = typeof EventTypes[keyof typeof EventTypes];

// ── Typed Payload Interfaces ───────────────────────────────────────────────

export interface DialogueUserObservedPayload {
  message: string;
}

export interface DialogueAgentSpeakPayload {
  message: string;
}

export interface SpawnGoalPayload {
  requestId: string;
  intent: string;
  parameters: Record<string, any>;
}

export interface ProposeGoalPayload {
  intent: string;
  parameters: Record<string, any>;
  userMessage?: string; // Optional narration or context
}

export interface GoalResultPayload {
  requestId: string;
  success: boolean;
  data: Record<string, any>;
  errorMessage?: string;
}

export interface TriggerFiredPayload {
  triggerId: string;
  action: string;
  targetId?: string;
  context: Record<string, any>;
}

export interface TemporalTickPayload {
  timestampUtc: number;
}

export enum SignalLevel {
  TRACE = 'TRACE',   // System noise, usually hidden
  INFO = 'INFO',     // Context parsing, standard operations
  ACTION = 'ACTION', // Real-world execution (blockchain/API)
  ALERT = 'ALERT',   // Critical failure, anomaly, or high-value insights
  SYSTEM = 'SYSTEM'  // Engine boots, core state changes
}

export interface CognitiveObservationPayload {
  title: string;
  desc: string;
  signal: SignalLevel | string;
  color: string; // e.g., "#ef4444", "#f59e0b", "#10b981"
  timestamp?: number;
  // Optional metadata for semantic reflection or clustering
  metadata?: Record<string, any>;
}

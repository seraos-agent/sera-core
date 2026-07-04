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
  SYSTEM_TRIGGER_FIRED: 'system.trigger.fired',
  SYSTEM_CYCLE_COMPLETED: 'system.cycle.completed',

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

export interface CognitiveObservationPayload {
  title: string;
  desc: string;
  signal: string;
  color: string; // e.g., "#ef4444", "#f59e0b", "#10b981"
  timestamp?: number;
}

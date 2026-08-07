---
sidebar_position: 2
---

# Agent Engine

The **Agent Engine** is the cognitive core of SERA OS. It is responsible for maintaining the world state, reasoning about user intents, and formulating actionable plans that adhere to strict system policies.

## Architecture

The Agent Engine is not a single monolithic class. It is a composition of specialized engines, each owning a distinct cognitive responsibility:

```
User Input
    │
    ▼
┌──────────────┐    ┌──────────────────┐
│ DialogueEngine│───▶│  IntentEngine    │
└──────────────┘    └──────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │  GoalSynthesizer │
                    └──────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │    Planner       │
                    └──────────────────┘
                           │
                           ▼
                    ┌──────────────────┐
                    │  GoalBridge      │
                    │  (Execution)     │
                    └──────────────────┘
```

## DialogueEngine

The `DialogueEngine` is the first point of contact for user messages. It:
- Classifies user intents (e.g., wallet query, market data request, fund transfer).
- Performs **pre-proposal validation** against WorldState.
- Emits structured `SPAWN_GOAL` events onto the EventBus.

> **Boundary Warning**: Any validation logic in DialogueEngine is *pre-proposal* validation only. True feasibility validation belongs to the Execution pipeline.

## IntentEngine & GoalSynthesizer

The `IntentEngine` decomposes natural language into structured **Intents** typed objects that describe what the user wants to achieve. The `GoalSynthesizer` then converts these Intents into executable **Goals**.

```typescript
// An Intent is a structured representation of user desire
interface Intent {
  id: string;
  type: 'TRANSFER' | 'QUERY' | 'MARKET_DATA' | 'AUTONOMY';
  parameters: Record<string, any>;
  constraints: IntentConstraint[];
}
```

## Planner

The `Planner` takes a Goal and generates a step-by-step execution `Plan`. It is informed by:

1. **Strategy Profiles** High-level behavioral preferences (conservative vs. aggressive).
2. **Working Memory** Past experiences, including beliefs about tool reliability.
3. **Intent Contracts** Assumptions that must hold true for the plan to be valid.

```typescript
// The Planner checks Intent Contract assumptions before planning
if (goal.intentContract) {
  for (const [field, expectedValue] of Object.entries(goal.intentContract.assumptions)) {
    const actualValue = worldState[field];
    if (actualValue !== expectedValue) {
      throw new IntentInvalidationError({
        type: 'ASSUMPTION_BREACH',
        field,
        expected: expectedValue,
        actual: actualValue
      });
    }
  }
}
```

This mechanism ensures that if the world state has changed between intent formulation and plan execution, the system **halts safely** rather than proceeding with stale assumptions.

## ConstitutionEngine

The `ConstitutionEngine` enforces hard policy boundaries. Every proposed action must pass through its rule evaluation before execution:

```typescript
export class ConstitutionEngine {
  evaluate(context: ConstitutionContext): ConstitutionDecision {
    let finalStatus: 'ALLOWED' | 'REQUIRES_CONFIRMATION' | 'DENIED' = 'ALLOWED';

    for (const rule of this.rules.values()) {
      const finding = rule.evaluate(context);
      // Priority: DENIED > REQUIRES_CONFIRMATION > ALLOWED
      if (finding?.status === 'DENIED') {
        finalStatus = 'DENIED';
      }
    }

    return { status: finalStatus, reason, findings };
  }
}
```

Possible outcomes:
- **ALLOWED**: Action proceeds without user intervention.
- **REQUIRES_CONFIRMATION**: User must approve before execution.
- **DENIED**: Action is blocked entirely (e.g., exceeds spend limits).

## GoalBridge

The `GoalBridge` connects the cognitive layer to real-world capabilities. It:
- Listens for `SPAWN_GOAL` events from the DialogueEngine.
- Routes each intent to the appropriate capability (Wallet, Market Data, Communication).
- Emits `GOAL_RESULT` events back onto the EventBus.

```typescript
// GoalBridge Connects EventBus to real Capabilities
export class GoalBridge {
  constructor(eventBus, sessionId, personalWalletAddress?, autonomyAgreementStore?) {
    this.eventBus.on(
      EventTypes.DOMAIN_ACTION_DISPATCHED,
      this.handleDispatchedAction.bind(this)
    );
  }
}
```

## Cognitive Subsystems

Beyond the core flow, SERA includes several cognitive subsystems:

| Subsystem | Purpose |
|-----------|---------|
| **AttentionEngine** | Prioritizes which signals deserve cognitive resources |
| **ReflectionEngine** | Post-execution analysis to improve future decisions |
| **CoherenceMonitor** | Detects contradictions in the agent's belief system |
| **CalibrationEngine** | Measures how well predictions match reality |
| **StrategyEngine** | Manages behavioral profiles and adaptation |
| **AdaptationPlanner** | Proposes changes to strategy based on reflection |

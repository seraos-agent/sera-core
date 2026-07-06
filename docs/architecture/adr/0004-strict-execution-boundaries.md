# ADR 0004: Strict Execution Boundaries and Routing

## Status
Accepted

## Context
When cognitive engines (like `DialogueEngine` or `TriggerEngine`) attempt to execute domains actions, a boundary blur often occurs where the cognitive engine dictates *how* the execution should happen, or the execution layer (`GoalBridge`) attempts to evaluate the cognitive validity of an action. This tangles reasoning logic with deterministic execution logic.

## Decision
The boundary between Reasoning and Execution is strictly mediated by the `ExecutionDispatcher`.
- **Reasoning Engines (Dialogue, Planners, Triggers):** Only emit intent events (e.g., `DOMAIN_GOAL_SPAWNED`). They do not know *how* to execute them.
- **ExecutionDispatcher:** Acts as a pure routing normalizer. It catches raw intents, normalizes their payloads, and emits a standardized `DOMAIN_ACTION_DISPATCHED` event. It possesses zero domain logic.
- **GoalBridge (and future execution adapters):** Listen only to normalized action events. They contain pure capability logic (API calls, blockchain tx) and assume the action is already cognitively approved. They emit results back to the bus.

## Consequences
- **Positive:** Enables scaling to multiple input streams (Discord, CLI, Scheduled Tasks) without touching execution code. Execution adapters remain purely deterministic.
- **Negative:** Adds a slight indirection layer for simple commands, as they must traverse the Dispatcher -> EventBus -> Bridge pipeline instead of a direct function call.

# ADR 0005: Event-Driven Reality Updates

## Status
Accepted

## Context
When cognitive processes (like Dialogue or Triggers) execute actions that mutate the outside world (like transferring funds), they often attempt to aggressively manually overwrite internal states (e.g., manually updating a wallet balance variable) to reflect what they "think" just happened. This causes optimistic updates that desync from reality if the external action fails silently or partially.

## Decision
Reality updates within Sera are strictly **Event-Driven and Reactive**.
- Cognitive components NEVER mutate the `WorldStateService` directly.
- The `WorldStateService` updates its internal state ONLY by listening to domain observation events (e.g., `DOMAIN_WALLET_STATE`) coming from the EventBus.
- Execution layers (like `GoalBridge` or sensors) are responsible for querying the actual external world and emitting observation events back to the bus.

## Consequences
- **Positive:** Guarantees that Sera's perception of reality is firmly grounded in actual observable facts, not optimistic assumptions. Simplifies the logic in cognitive engines.
- **Negative:** Introduces asynchronous latency. A component checking the balance immediately after firing a transfer might see the old balance until the observation event propagates. Engines must be designed to tolerate this asynchronous nature of reality.

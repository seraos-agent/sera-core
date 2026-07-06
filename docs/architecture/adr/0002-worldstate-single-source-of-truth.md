# ADR 0002: WorldState as Single Source of Truth

## Status
Accepted

## Context
Various cognitive components (e.g., DialogueEngine) and adapters (e.g., server sockets) need access to the current state of reality (like wallet balances, locations, or environmental conditions). When these components cache or request this state independently, it leads to desynchronization, duplicated network requests, and contradictory logic (e.g., a "shadow state" in the server layer holding stale wallet data).

## Decision
`WorldStateService` is established as the **Single Source of Truth** for all external reality representation within SERA.
- Cognitive engines (Reasoning, Reflection, Dialogue) and adapters must NEVER cache domain state independently.
- Components must query `WorldStateService` when they need to perceive reality.
- `WorldStateService` alone is responsible for aggregating, caching, and validating real-world observations via incoming events.

## Consequences
- **Positive:** Guarantees absolute consistency across the agent's cognition. Reduces network spam to external APIs. Centralizes the logic for "observation quality" (e.g., freshness and source verification of data).
- **Negative:** `WorldStateService` becomes a high-throughput dependency that must handle concurrent read queries efficiently without becoming a bottleneck.

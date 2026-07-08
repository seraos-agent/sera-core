# ADR 0003: Unified System EventBus

## Status
Accepted

## Context
During initial development, the system began spawning multiple overlapping event layers (e.g., a native `EventEmitter` for the server/UI, and a custom `ExecutionEventBus` wrapper for cognitive execution). This dual-bus architecture caused event bridging complexity, duplicated payload definitions, and made system-wide observability difficult.

## Decision
Sera will utilize a **Unified System EventBus** based on a single native `EventEmitter` instance, injected vertically through the `Runtime` to all components.
- No secondary or domain-specific bus implementations will be created.
- All system events (intent spawned, execution dispatched, world state updated, temporal ticks) travel through this single nervous system.
- Components only subscribe to the specific `EventTypes` they care about.

## Consequences
- **Positive:** Dramatically simplifies the architecture. Reduces memory overhead. Enables powerful observability (e.g., a single logger or visualizer can tap into the bus and see the entire OS flow).
- **Negative:** Requires rigorous discipline in event payload typing (`StandardEvent` wrapper) to prevent malformed data from crashing downstream listeners on the shared bus.

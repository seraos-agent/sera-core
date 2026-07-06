# ADR 0001: Runtime as Composition Root

## Status
Accepted

## Context
As SERA grows, multiple entry points (Socket, HTTP, CLI, Telegram) will need to interact with the core cognitive engines. Previously, component instantiation and wiring were bleeding into the server adapter (`server/index.ts`), making the core system tightly coupled to its I/O delivery mechanism and prone to fragmented state management.

## Decision
The `Runtime` class is designated as the sole **Composition Root** of the SERA core system. 
- External adapters (like `server/index.ts`) must only act as interfaces that translate external signals into internal events.
- All cognitive components, memory stores, and domain bridges must be instantiated, wired together, and injected within the `Runtime` lifecycle or passed down from it.
- Adapters must not hold domain state or duplicate core logic.

## Consequences
- **Positive:** Easier testing, as the entire OS can be booted in memory without network bindings. Safe extensibility for new UI adapters (e.g., Discord or CLI) since they only need to interface with `Runtime`.
- **Negative:** `Runtime` becomes a heavy constructor and orchestrator, requiring strict discipline to ensure it remains a pure assembler and does not absorb domain logic itself.

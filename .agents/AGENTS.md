# Sera Operating System Architectural Principles

This file enshrines the core architectural constraints of Sera. As an AI building Sera, you MUST obey these rules:

1. **Runtime is the Composition Root**
   - `server/index.ts` is only a boundary/adapter (Socket, HTTP, CLI).
   - Core engines (`WorldStateService`, `DialogueEngine`, `Planner`) must be instantiated and wired together inside `Runtime` or injected into it.

2. **WorldStateService Owns Reality**
   - `WorldStateService` is the single source of truth for the entire environment (Wallet, Location, Temporal, Connection, etc.).
   - Cognitive components (Dialogue, Planner, Reflection) ONLY QUERY reality. They NEVER own it or cache it independently.

3. **Immutable by Events (Event-Driven Reality)**
   - Reality enters the system ONLY through observations and events.
   - Components NEVER ask the outside world directly. They ask World State. World State asks the world (via GoalBridge/Sensors) and updates itself through the EventBus.
   - Example: Dialogue does not query the blockchain. Dialogue asks WorldState.

4. **Rich State Observation Quality**
   - WorldState is not a passive bag of values. It includes observation quality metrics.
   - Example: `WalletState` must track `balance`, `updatedAt`, `source`, `freshness`. The real world is asynchronous.

5. **Pre-Proposal Validation vs Feasibility**
   - `DialogueEngine` performs *pre-proposal validation*.
   - True *feasibility* validation inherently belongs to the Execution pipeline (e.g. before Triggers or Reflection execute a goal).
   - Any validation logic in `DialogueEngine` MUST be clearly commented with a boundary warning, noting it should be extracted to an execution-stage service when Sera scales to multiple entry points.

6. **Cognitive Telemetry Boundary**
   - Cognitive Telemetry measures the internal health and evolution of SERA. 
   - It is not a measure of user activity, nor a replacement for reasoning. 
   - Metrics provide evidence for reflection, not direct control over decisions.
   - Do NOT expose this telemetry as an 'AI analytics dashboard' to end-users.

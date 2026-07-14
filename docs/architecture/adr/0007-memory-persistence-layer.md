# ADR 0007: Memory Persistence Layer

## Status
Proposed

## Context
The question that started this thread was narrow: "what if memory is stored on the device?" Working through the consequences — device loss causing agent amnesia, the Liquidity Node's need for portable identity without a permanently-online device, the cost motivation behind wanting memory off SERA's own servers — the question turned out to be broader: how should an Agent's cognitive state be persisted portably, safely, efficiently, and consistently, independent of where the Runtime happens to execute.

`IMemoryStore` today is fully synchronous, and its only implementation (`JsonMemoryStore`) writes to local disk on every single mutation (`storeBelief` → `persist()` → `fs.writeFileSync`, unconditionally). Two migration paths were considered:

1. Make `IMemoryStore` itself asynchronous, so any method can be backed by network storage (Dropbox, S3, IPFS, etc.). Rejected — this would force `await` into every read/write across the entire reasoning path (`Planner`, `GoalEngine`, `DialogueEngine`, `ConstitutionEngine`, and others), for a benefit (external storage) that has nothing to do with the hot path of moment-to-moment cognition.
2. Split responsibilities: keep an in-memory, synchronous store for the lifetime of a running instance, and introduce a separate, asynchronous persistence boundary that only matters at load and save time. Adopted.

Naively porting the current "write on every mutation" behavior to a remote backend would mean a network PUT per belief — for a 200MB memory profile under active use, this is both slow and needlessly expensive regardless of which backend is chosen.

## Decision

**Split into two interfaces.**
- `IWorkingMemory` — synchronous, in-memory, scoped to the lifetime of a running Runtime instance. This is effectively today's `IMemoryStore` surface (`storeBelief`, `getBeliefsByCategory`, `getBeliefByKey`, etc.) — no caller-facing change. Every existing consumer keeps calling it exactly as it does today.
- `IMemoryPersistence` — asynchronous, responsible only for `load()` and `save()` of a serialized memory snapshot to a backend (local disk, S3, Dropbox, iCloud, IPFS, self-hosted, etc.).

**Lifecycle.**
1. Runtime start: `await persistence.load()` → hydrate a fresh `WorkingMemory` from the returned snapshot.
2. During execution: all reasoning components read/write `WorkingMemory` synchronously, unchanged from today.
3. Checkpointing (not save-only-at-shutdown): `TemporalClockService` — already firing periodic ticks in every Runtime — triggers `await persistence.save()` on an interval, and additionally after goal completion and after reflection completion. This closes the durability gap a pure load-at-start/save-at-end design would otherwise introduce compared to today's per-mutation write.
4. Runtime end: distill any remaining `ExecutionTrace` into beliefs, update `WorkingMemory`, final `await persistence.save()`.

**Persistence pipeline (v1), applied in this order:** `WorkingMemory` snapshot → Compression → Encryption → Storage Adapter. Compression before encryption, not after — encrypted output is high-entropy and does not compress meaningfully once encrypted.

**v1 scope — build only this:**
- `IWorkingMemory` / `IMemoryPersistence` split as above.
- Checkpointing via `TemporalClockService` (interval + goal/reflection completion hooks).
- Compression + client-side encryption (key held by the user, never the backend) as non-optional parts of the pipeline, not an add-on.
- One concrete storage adapter.
- **Explicit, documented limitation:** v1 assumes a single active session per Agent. There is no multi-device synchronization, no version negotiation, and no conflict detection. Opening the same Agent from a second device while a session is active is unsupported behavior, not silently-handled behavior — this is a known limitation, not an oversight.

**v2 — extension points defined now, not implemented now:**
- **Versioning**, optimistic (Git-like — a monotonic version number per snapshot; a save against a stale version is rejected rather than silently overwriting).
- **Delta journal**, so an active session emits incremental changes (append-only, LSM-tree-style) instead of re-uploading a full snapshot on every checkpoint, with periodic compaction back into a full snapshot.
- **Conflict resolution**, for when two sessions do diverge. Default behavior when this is built: last-writer-wins per belief key, followed by re-running the existing `MemoryPolicyEngine` / contradiction checks against the merged result — not a semantic three-way merge. Belief merging is not line-based text merging; a belief carries `epistemicStatus`, `confidence`, `evidenceIds`, and `contradictionIds`, and a naive union-merge risks resurrecting exactly the contradictions those fields exist to catch.

Adapter implementations must expose capability flags (e.g. `supportsDelete`, `supportsMutableWrite`) rather than assuming uniform behavior — IPFS is content-addressed (no in-place update) and Arweave is deliberately permanent (no delete), so lifecycle policy needs to know what a given backend can actually do.

## Consequences
- **Positive:** No change to any existing reasoning-path caller — the async boundary sits only at `IMemoryPersistence.load()`/`save()`. Reuses `TemporalClockService`, no new scheduling infrastructure. Memory becomes portable and user-owned (encrypted, stored wherever the user chooses) without forcing the entire cognitive loop through `await`. Ships something real (v1) instead of stalling on distributed-systems problems (versioning, conflict resolution) that don't yet have real usage data behind them.
- **Negative:** Single-session assumption in v1 means a user who opens the same Agent from two devices simultaneously can silently lose the second session's changes on save (last save wins, no detection) — acceptable for v1 precisely because it's documented, not hidden. Checkpoint-based durability, while far better than load/save-only, is still not equivalent to today's per-mutation write — a crash between checkpoints loses whatever changed since the last one. Deferring delta journaling means v1 checkpoints re-serialize the full snapshot each time, which is fine at current scale but will need revisiting before large memory profiles make full-snapshot checkpointing itself expensive.

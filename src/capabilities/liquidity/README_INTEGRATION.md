# Liquidity Capability — Integration Notes

This directory contains the Liquidity Capability (ADR-0006).

## What's intentionally NOT done here (deliberate follow-ups, not oversights)

1. **Not wired into GoalBridge.** Adding `LIQUIDITY_DISCOVER` / `LIQUIDITY_QUOTE` / `LIQUIDITY_EXECUTE` cases to `GoalBridge.handleDispatchedAction()` is what would give this free `ExecutionTrace` tracking via the existing Goal → Plan → ExecutionCoordinator pipeline (same as wallet). Left out because the action-type names and how DialogueEngine should trigger them are product decisions, not scaffolding.
2. **`execute()` does not move real assets.** It settles bookkeeping (idempotency, quote validity, event emission) but the actual transfer leg (on-chain via WalletCapability/BaseAdapter, or a future fiat rail) is not wired in. Wiring it silently here would repeat the exact mistake ADR-0006 was written to avoid.
3. **`PricingSource` is a stub interface**, not a real price feed. `flatPricing` in the test file is illustrative only — a real pricing source (internal book or oracle) is undefined scope per the ADR.
4. **`FIAT_RAIL_ENABLED` defaults to `false`** and is a constructor argument, not an env var — so turning it on is a deliberate code change reviewed like any other, not a deployment config flip.

---
sidebar_position: 3
---

# MPC Wallet Integration

SERA OS includes a sophisticated wallet system that allows AI agents to execute real on-chain transactions **without exposing raw private keys** to the LLM reasoning layer.

## Architecture

The wallet system is organized into three layers:

```
┌──────────────────────────────────────────┐
│         UniversalAgenticWallet           │
│   (Capability Layer — Execution Router)  │
├──────────────────────────────────────────┤
│     SpendPermissionAdapter (Guard)       │
│     SecretManager (Key Isolation)        │
├──────────────┬───────────────────────────┤
│ BaseAdapter  │  PolygonAdapter           │
│ (Base Chain) │  (Polygon Chain)          │
└──────────────┴───────────────────────────┘
```

## UniversalAgenticWallet

The `UniversalAgenticWallet` is the universal execution router. It:

- Operates purely on the `ExecutionContext` abstraction.
- Does **NOT** know about EVM, Base, or specific blockchains directly.
- Resolves the `network` field to decide which Reality Adapter to invoke.
- Enforces universal rules via SpendPermissions and SecretManager.

```typescript
export class UniversalAgenticWallet implements IExecutionCapability {
  private secretManager: SecretManager;
  private permissionGuard: SpendPermissionAdapter;
  
  // Pluggable reality adapters
  private baseAdapter: BaseAdapter;
  private polygonAdapter: PolygonAdapter;

  async initialize(userAddress?: string): Promise<WalletId> {
    let privateKey = await this.secretManager.getAgenticWalletPrivateKey(userAddress);
    if (!privateKey) {
      // Auto-generate a new wallet if none exists
      const pk = generatePrivateKey();
      const account = privateKeyToAccount(pk);
      await this.secretManager.setAgenticWalletPrivateKey(pk, userAddress);
      await this.secretManager.setAgenticWalletAddress(account.address, userAddress);
    }
    return this.walletId;
  }
}
```

## Security Model

### Key Isolation via SecretManager

Private keys are **never** passed to the LLM or stored in plain text. The `SecretManager` provides an encrypted boundary:

- Keys are stored in an `EncryptedDatabaseSecretStore`.
- The LLM only ever sees wallet *addresses* never raw keys.
- Key retrieval is mediated through the `SecretManager` API.

### Spend Permission Guard

Before any outgoing transaction, the `SpendPermissionAdapter` validates:

1. **Transaction amount** against user-defined spending limits.
2. **Destination address** against allowlists/blocklists.
3. **Frequency** — prevents rapid successive transactions that could indicate rogue behavior.

### Custody Providers

SERA supports pluggable custody providers via the `WalletCustodyProviderFactory`:

| Provider | Environment | Description |
|----------|-------------|-------------|
| `LocalDevelopmentCustodyProvider` | Development | Uses locally generated keys. Only for testnet. |
| `ThirdwebCustodyProvider` | Production | Enterprise-grade custody via Thirdweb. |

```typescript
// The factory pattern ensures production fails closed
export function createWalletCustodyProvider(): WalletCustodyProvider {
  if (process.env.CUSTODY_PROVIDER === 'thirdweb') {
    return new ThirdwebCustodyProvider();
  }
  // Development only — production deployments must configure
  // a managed provider
  return new LocalDevelopmentCustodyProvider();
}
```

## Multi-Chain Support

SERA's wallet system is designed to be chain-agnostic. Each chain has its own **Reality Adapter**:

- **BaseAdapter** (`chains/BaseAdapter.ts`) Handles transactions on the Base L2 network.
- **PolygonAdapter** (`chains/PolygonAdapter.ts`) Handles transactions on Polygon.

The `UniversalAgenticWallet` selects the correct adapter based on the `network` field in the `ExecutionContext`:

```typescript
async execute(context: ExecutionContext): Promise<ExecutionReceipt> {
  const network = context.network || 'base-mainnet';
  
  if (network.startsWith('polygon')) {
    return this.polygonAdapter.execute(context);
  }
  return this.baseAdapter.execute(context);
}
```

## WorldState Integration

Wallet state flows into the system through the EventBus, not through direct queries:

```typescript
// WorldStateService subscribes to wallet events
eventBus.on(EventTypes.DOMAIN_WALLET_STATE, (event) => {
  this.state.wallet = {
    address: event.payload.address,
    balance: parseFloat(event.payload.balance),
    quality: {
      updatedAt: Date.now(),
      source: 'EventBus/DOMAIN_WALLET_STATE',
      freshness: 'FRESH',
      confidence: 1.0
    }
  };
});
```

This means the DialogueEngine never queries the blockchain directly it asks WorldState, which is kept current through event-driven updates.

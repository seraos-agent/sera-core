---
sidebar_position: 6
---

# Sera Arena

**Sera Arena** is SERA OS's native prediction market engine. It allows users and AI agents to place directional bets (UP or DOWN) on real-time asset prices using a **Parimutuel pool** model.

## Overview

Unlike traditional order-book exchanges, Sera Arena uses a **pool-based** system where all bets on a market are collected into a shared pool. When the market resolves, winners split the entire pool proportionally to their stake.

<img src="/img/sera-arena-screenshot-v2.png" alt="Sera Arena Interface" style={{ width: '100%', maxWidth: '750px', display: 'block', margin: '20px auto', borderRadius: '12px', border: '1px solid var(--ifm-color-emphasis-200)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />

## How It Works

### 1. Rolling Markets

Sera Arena automatically creates **time-based rolling markets** for BTC price prediction:

| Market ID | Duration | Description |
|-----------|----------|-------------|
| `btc-5m-rolling` | 5 minutes | Short-term BTC price prediction |
| `btc-15m-rolling` | 15 minutes | Medium-term BTC price prediction |

Each market has a **strike price** (the BTC price at market creation). When the market expires, the outcome is determined by comparing the current BTC price against the strike price.

### 2. Placing Bets

Users stake USDC on either **UP** (price will be above strike) or **DOWN** (price will be below strike):

```typescript
// Place a bet via the PredictionEngineService
const order = await predictionEngine.placeOrder(
  userId,       // User or Agent identifier
  'btc-5m-rolling',  // Market ID
  'UP',              // Direction: 'UP' or 'DOWN'
  25                 // Amount in USDC
);
```

### 3. Dynamic Odds

Odds are calculated dynamically based on pool sizes. The formula uses a 2% house fee:

```typescript
const grossPool = totalUp + totalDown;
const netPool = grossPool * 0.98;  // 2% fee

// Odds for UP bettors
const oddsUp = netPool / totalUp;   // e.g., 1.40x

// Odds for DOWN bettors  
const oddsDown = netPool / totalDown; // e.g., 3.27x
```

This means: if there's $350 in the UP pool and $150 in the DOWN pool, DOWN bettors get a higher payout multiplier because they're betting against the majority.

### 4. Market Resolution

When a market expires, the `PredictionEngineService` resolves it automatically:

1. Fetches the **current BTC price** from Binance API.
2. Compares it against the market's **strike price**.
3. If current price > strike price → **UP wins**.
4. If current price ≤ strike price → **DOWN wins**.
5. Winners receive their proportional share of the net pool.
6. A **new rolling market** is automatically created.

## Seed Liquidity (AMM)

To prevent extreme odds when a market is newly created (e.g., the first $1 bet getting 100x odds), Sera Arena injects **seed liquidity** on both sides:

```typescript
private injectSeedLiquidity(marketId: string) {
  const seedAmount = 50; // 50 USDC on each side
  this.orders.push({
    userId: 'SYSTEM_SEED', marketId, side: 'UP', amount: seedAmount, status: 'PENDING'
  });
  this.orders.push({
    userId: 'SYSTEM_SEED', marketId, side: 'DOWN', amount: seedAmount, status: 'PENDING'
  });
}
```

This ensures reasonable starting odds even with low initial participation.

## AI Agent Integration

SERA's AI agent can autonomously interact with Sera Arena through the `SeraArenaToolCapability`:

| Tool | Description | Approval Required |
|------|-------------|:-----------------:|
| `SERA_ARENA_SEARCH_MARKETS` | List all active prediction markets | No |
| `SERA_ARENA_GET_ORDERBOOK` | Get pool sizes and dynamic odds for a market | No |
| `SERA_ARENA_TRADE` | Place a bet (UP/DOWN) using USDC | **Yes** |

Note that `SERA_ARENA_TRADE` requires user approval (`requiresApproval: true`) and is marked as **irreversible** since bets cannot be withdrawn once placed.

### Example Agent Conversation

```
User: "What prediction markets are available right now?"

SERA: I found 2 active markets on Sera Arena:
  1. BTC Up or Down 5m  (expires in 3:42)
     Strike: $103,450 | UP: 1.40x | DOWN: 3.27x
  2. BTC Up or Down 15m (expires in 12:18)
     Strike: $103,450 | UP: 1.85x | DOWN: 2.10x

User: "Place 10 USDC on BTC UP for the 5 minute market"

SERA: I'd like to place the following bet:
  Market: BTC Up or Down 5m
  Side: UP
  Amount: 10 USDC
  Current Odds: ~1.40x (potential payout: ~14 USDC)
  
  Do you approve this trade? [Yes / No]
```

## Real-Time Price Feed

Sera Arena fetches live BTC price data from the **Binance API** and maintains a local candle history for chart rendering:

```typescript
private async updateBtcPrice() {
  const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  const data = await res.json();
  this.currentBtcPrice = parseFloat(data.price);
}
```

This price feed is used for:
- Setting the **strike price** when a new market is created.
- **Resolving markets** when they expire.
- Powering the **live price chart** in the frontend.

## Portfolio Tracking

Users can view their complete betting history and current positions:

```typescript
const portfolio = predictionEngine.getPortfolio(userId);
// Returns:
// {
//   balance: 975,           // Current USDC balance
//   orders: [...],          // Active (pending) bets
//   history: [...]          // Resolved bets with outcomes
// }
```

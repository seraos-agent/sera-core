# ADR 0006: Decoupled Monetization Model (OS vs Marketplace Apps)

## Status
Proposed

## Context
Sera's monetization strategy initially bundled agent intelligence and 3rd-party integrations together into subscription tiers (e.g., Free, Pro, Elite). However, this created several architectural and business risks:
1. **Financial Risk (Nickel-and-diming vs Bankruptcy)**: Promising "unlimited integrations" in a flat monthly fee (e.g., 20 USDC) creates unbounded liabilities if a user connects a high-traffic enterprise system (like Shopify or Salesforce) that consumes massive server polling resources.
2. **Cognitive Gating**: Restricting core agentic capabilities (like Memory and Deep Reflection) to higher tiers cripples the fundamental "OS" experience for lower tiers, making the agent feel unintelligent.
3. **Billing Synchronization**: Bundling products means dealing with complex prorating logic if a user adds or removes a service mid-month while on a fixed agent subscription cycle.

## Decision
We are adopting a **Decoupled Monetization Architecture** modeled after an OS/App Store ecosystem. The system is split into two independent billing domains:

1. **Layer 1: The Engine (Agent Subscription)**
   - **What it is**: The core OS subscription (billed monthly in USDC). 
   - **What it grants**: Raw intelligence (LLM Tokens) and Compute (Background tasks, memory access).
   - **Tiers**:
     - **Free**: No guaranteed token quota; extremely limited background execution.
     - **Pro**: Standard intelligence model (e.g., GPT-4o-mini), baseline monthly token quota, standard execution limits.
     - **Elite**: Max intelligence model (e.g., Deep Reasoning/Claude 3.5 Sonnet), massive token quota, unlimited/priority execution.
   - **Key Principle**: *Cognition is not paywalled; scale and bandwidth are.* All tiers get memory and reflection; they just have different "fuel" limits.

2. **Layer 2: The Applications (Marketplace Add-ons)**
   - **What it is**: Integrations (e.g., Slack, Shopify, Telegram Bot Hosting) are standalone products in the "Workspace".
   - **What it grants**: The webhook/polling infrastructure required to connect a 3rd-party service to the Sera EventBus.
   - **Pricing**: Each product is priced individually (e.g., 10 USDC/month for Shopify, 5 USDC/month for Slack) based on its server load.
   - **Key Principle**: Products operate on independent billing cycles. 

## Consequences
- **Elegant Mid-Month Upgrades**: A user can buy a Slack integration mid-month. It runs on its own billing cycle (e.g., 15th to 15th).
- **Symbiotic Dependency**: If a user's Agent Subscription (Engine) expires or runs out of tokens, their Slack Integration (Application) remains active, but the Agent will respond with an "Out of Cognitive Quota" message instead of processing the business logic. This acts as a natural upsell.
- **Clean Architecture**: The execution layer (`CognitiveLoop`) does not need to check billing tiers to enable/disable memory. The Wallet/Execution modules do not need to calculate prorated refunds for app uninstalls.
- **UI Impact**: The "Account/Billing" UI will exclusively handle the Agent Subscription (Engine). A separate "Workspace/Marketplace" UI will handle the a la carte purchasing of Integrations.

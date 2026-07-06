export type NetworkResolution = 'auto' | string; // e.g., 'auto', 'base-mainnet', 'ethereum', 'stripe'

export interface AssetDescriptor {
  id: string; // e.g., 'usdc', 'usd', 'points'
  classification: 'token' | 'native' | 'virtual' | 'fiat';
  reference?: string; // Optional metadata for the adapter (e.g., token address if known)
}

/**
 * ExecutionContext forms the pure abstraction layer between 
 * the Cognitive Runtime (GoalBridge) and the Capability Reality Layer (Adapters).
 */
export interface ExecutionContext<T> {
  network: NetworkResolution;
  asset?: AssetDescriptor;
  intent: T;
}

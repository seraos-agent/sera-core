import { LiquidityNode, LiquidityDiscoveryCriteria } from './types';

/**
 * MVP discovery backing store — a single in-process, off-chain directory.
 *
 * Per ADR-0006: this is an explicit bootstrap decision (centralized, single
 * point of trust/failure), not a permanent structural commitment. The
 * register/find boundary is kept narrow on purpose so it can be swapped for
 * a hybrid registry (on-chain identity anchor + off-chain gossip for live
 * availability) later without touching LiquidityExecutor or its callers —
 * the same adapter-behind-an-interface shape already used for
 * IMemoryStore/JsonMemoryStore.
 */
export class LiquidityDirectory {
  private nodes: Map<string, LiquidityNode> = new Map();

  register(node: LiquidityNode): void {
    this.nodes.set(node.nodeId, node);
  }

  deregister(nodeId: string): void {
    this.nodes.delete(nodeId);
  }

  get(nodeId: string): LiquidityNode | undefined {
    return this.nodes.get(nodeId);
  }

  updateStatus(
    nodeId: string,
    availability: LiquidityNode['availability'],
    readiness: LiquidityNode['readiness']
  ): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;
    node.availability = availability;
    node.readiness = readiness;
    node.updatedAt = Date.now();
  }

  /**
   * Discovery only returns candidates — it never executes anything (see
   * ADR-0004). `fiatRailEnabled` is passed in explicitly by the caller
   * (LiquidityExecutor) rather than read from env here, so this class stays
   * a pure data-access adapter with no policy logic of its own.
   */
  find(criteria: LiquidityDiscoveryCriteria, fiatRailEnabled: boolean): LiquidityNode[] {
    return Array.from(this.nodes.values()).filter((node) => {
      if (node.availability !== 'ONLINE' || node.readiness !== 'AVAILABLE') return false;
      if (!node.supportedAssets.includes(criteria.asset)) return false;
      if (criteria.amount < node.limits.minAmount || criteria.amount > node.limits.maxAmount) return false;

      const wantsFiat = !!criteria.fiat;
      if (wantsFiat) {
        // Fiat gate (ADR-0006): a fiat-capable node is unlistable for a
        // fiat-denominated request unless the rail has been explicitly
        // turned on. Nodes without fiat support are unaffected — they simply
        // never match a fiat criteria, same as before this gate existed.
        if (!fiatRailEnabled) return false;
        const nodeSupportsFiat = node.supportedFiatCurrencies?.includes(criteria.fiat!);
        if (!nodeSupportsFiat) return false;
      }

      return true;
    });
  }
}

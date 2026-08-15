import { describe, expect, it } from 'vitest';
import { DomainProductContractRegistry } from '../src/core/products/DomainProductContractRegistry';
describe('DomainProductContractRegistry', () => {

  it('refuses a high-risk route that tries to omit explicit authority', () => {
    const registry = new DomainProductContractRegistry();
    expect(() => registry.register({
      id: 'unsafe-product', capabilities: ['WRITE'], liveTradingEnabled: false,
      intentRoutes: { WRITE: 'HIGH_RISK' }
    })).toThrow(/explicit authority/);
  });
});

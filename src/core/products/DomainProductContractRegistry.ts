import { WorkClass } from '../work-classification/WorkClassificationPolicy';

export interface DomainProductContract {
  id: string;
  capabilities: readonly string[];
  intentRoutes: Readonly<Record<string, WorkClass>>;
  liveTradingEnabled: boolean;
  requiresHumanApproval?: Readonly<Record<string, boolean>>;
}

const workClasses: readonly WorkClass[] = ['INSTANT_UI', 'CONVERSATION', 'OPERATIONAL', 'COMPLEX', 'HIGH_RISK'];

/**
 * Registry for a product's declared boundary. It has no execution behaviour:
 * its sole responsibility is to validate and expose the product contract that
 * the universal runtime is allowed to load.
 */
export class DomainProductContractRegistry {
  private readonly contracts = new Map<string, DomainProductContract>();

  public register(contract: DomainProductContract): void {
    if (!contract.id.trim()) throw new Error('Product contract id is required.');
    if (this.contracts.has(contract.id)) throw new Error(`Product contract ${contract.id} is already registered.`);
    if (contract.capabilities.length === 0) throw new Error(`Product contract ${contract.id} must declare at least one capability.`);

    const capabilitySet = new Set(contract.capabilities);
    if (capabilitySet.size !== contract.capabilities.length) throw new Error(`Product contract ${contract.id} declares duplicate capabilities.`);
    for (const capability of contract.capabilities) {
      if (!contract.intentRoutes[capability]) throw new Error(`Product contract ${contract.id} has no route for ${capability}.`);
    }
    for (const [intent, workClass] of Object.entries(contract.intentRoutes)) {
      if (!workClasses.includes(workClass)) throw new Error(`Product contract ${contract.id} has invalid work class for ${intent}.`);
      if (workClass === 'HIGH_RISK' && !contract.requiresHumanApproval?.[intent]) {
        throw new Error(`High-risk intent ${intent} in ${contract.id} must require human approval.`);
      }
    }
    if (contract.liveTradingEnabled) {
      const hasProtectedHighRiskIntent = Object.entries(contract.intentRoutes).some(([intent, workClass]) =>
        workClass === 'HIGH_RISK' && contract.requiresHumanApproval?.[intent]
      );
      if (!hasProtectedHighRiskIntent) throw new Error(`Live product ${contract.id} needs a human-approved high-risk intent.`);
    }
    this.contracts.set(contract.id, contract);
  }

  public get(id: string): DomainProductContract {
    const contract = this.contracts.get(id);
    if (!contract) throw new Error(`Product contract ${id} is not registered.`);
    return contract;
  }

  public resolveWorkClass(productId: string, intent: string): WorkClass {
    const workClass = this.get(productId).intentRoutes[intent];
    if (!workClass) throw new Error(`Intent ${intent} is not declared for product ${productId}.`);
    return workClass;
  }

  public assertCapabilitiesAvailable(productId: string, availableCapabilities: readonly string[]): void {
    const available = new Set(availableCapabilities);
    for (const capability of this.get(productId).capabilities) {
      if (!available.has(capability)) throw new Error(`Product ${productId} declares unavailable capability ${capability}.`);
    }
  }
}

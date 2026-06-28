import { Allocation, SpendingRequest } from './types';

export class TreasuryService {
  private allocations: Map<string, Allocation> = new Map();

  registerAllocation(allocation: Allocation): void {
    this.allocations.set(allocation.allocationId, allocation);
  }

  getAllocation(allocationId: string): Allocation | undefined {
    return this.allocations.get(allocationId);
  }

  validateBudget(request: SpendingRequest): boolean {
    const allocation = this.allocations.get(request.allocationId);
    if (!allocation) return false;
    
    return allocation.availableBudget >= request.amount;
  }

  reserve(request: SpendingRequest): boolean {
    const allocation = this.allocations.get(request.allocationId);
    if (!allocation || allocation.availableBudget < request.amount) return false;

    allocation.availableBudget -= request.amount;
    allocation.reservedBudget += request.amount;
    console.log(`[TreasuryService] Reserved $${request.amount} from allocation ${request.allocationId}`);
    return true;
  }

  settle(request: SpendingRequest): boolean {
    const allocation = this.allocations.get(request.allocationId);
    if (!allocation || allocation.reservedBudget < request.amount) return false;

    allocation.reservedBudget -= request.amount;
    allocation.settledAmount += request.amount;
    console.log(`[TreasuryService] Settled $${request.amount} from allocation ${request.allocationId}`);
    return true;
  }

  release(request: SpendingRequest): boolean {
    const allocation = this.allocations.get(request.allocationId);
    if (!allocation || allocation.reservedBudget < request.amount) return false;

    allocation.reservedBudget -= request.amount;
    allocation.availableBudget += request.amount;
    console.log(`[TreasuryService] Released $${request.amount} back to allocation ${request.allocationId}`);
    return true;
  }
}

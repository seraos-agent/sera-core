import { Runtime } from './runtime/Runtime';
import { Goal } from './core/goals/types';
import { DelegationScope } from './delegation/types';
import { WorkerManager } from './workers/WorkerManager';
import { ToolWorker } from './workers/ToolWorker';
import { ToolRegistry } from './tools/ToolRegistry';
import { ToolRuntime } from './tools/ToolRuntime';
import { VerificationService } from './tools/VerificationService';
import { MockReadTool } from './tools/MockReadTool';
import { MockFailVerificationTool } from './tools/MockFailVerificationTool';
import { ConstitutionEngine } from './constitution/ConstitutionEngine';
import { TreasuryService } from './treasury/TreasuryService';
import { PaymentAuthorityService } from './treasury/PaymentAuthorityService';
import { Allocation, SpendingRequest } from './treasury/types';

async function main() {
  console.log('=== SERA Core - Stage 2.5: Treasury & Payment Authority Demo ===');
  
  // Setup Tool Layer
  const registry = new ToolRegistry();
  registry.register(new MockReadTool());
  registry.register(new MockFailVerificationTool());
  const toolRuntime = new ToolRuntime(registry);
  const verificationService = new VerificationService();

  // Setup Execution Layer
  const workerManager = new WorkerManager();
  const worker = new ToolWorker('demo-worker', toolRuntime, verificationService);
  workerManager.register(worker);

  // Setup Financial Layer
  const treasuryService = new TreasuryService();
  const marketingAlloc: Allocation = {
    allocationId: 'alloc-marketing',
    name: 'Marketing Budget',
    totalBudget: 5000,
    availableBudget: 5000,
    reservedBudget: 0,
    settledAmount: 0,
    purpose: 'Advertising and outreach',
    authorityScope: 'scope-allowed'
  };
  treasuryService.registerAllocation(marketingAlloc);
  
  const paymentAuthorityService = new PaymentAuthorityService();

  // Setup Decision Layer
  const runtime = new Runtime(workerManager, new ConstitutionEngine(), treasuryService, paymentAuthorityService);
  
  const principalId = 'user-999';

  const baseGoal: Goal = {
    id: `goal-finance-${Date.now()}`,
    description: 'Execute a spending task',
    targetState: { paymentCompleted: true },
    status: 'PENDING',
    createdAt: Date.now()
  };

  const allowedScope: DelegationScope = {
    id: 'scope-allowed',
    principalId,
    allowedPermissions: [{ action: 'execute_payment' }],
    requiresApprovalPermissions: [],
  };

  console.log('\n--- Case 1: Budget Available, Authority Allowed (Settles) ---');
  const req1: SpendingRequest = { amount: 500, allocationId: 'alloc-marketing', purpose: 'Ad campaign' };
  await runtime.processGoal({ ...baseGoal, id: 'g1' }, allowedScope, 'execute_payment', {}, req1);
  console.log('Treasury State:', treasuryService.getAllocation('alloc-marketing'));

  console.log('\n--- Case 2: Budget Available, Authority Requires Approval (Pauses) ---');
  const req2: SpendingRequest = { amount: 2000, allocationId: 'alloc-marketing', purpose: 'Large campaign' }; // Amount > 1000 triggers REQUIRES_APPROVAL
  await runtime.processGoal({ ...baseGoal, id: 'g2' }, allowedScope, 'execute_payment', {}, req2);
  console.log('Treasury State:', treasuryService.getAllocation('alloc-marketing'));

  console.log('\n--- Case 3: Budget Exceeded (Denied) ---');
  const req3: SpendingRequest = { amount: 6000, allocationId: 'alloc-marketing', purpose: 'Exceed budget' };
  await runtime.processGoal({ ...baseGoal, id: 'g3' }, allowedScope, 'execute_payment', {}, req3);
  console.log('Treasury State:', treasuryService.getAllocation('alloc-marketing'));

  console.log('\n--- Case 4: Verification Failure (Not settled, released) ---');
  // Pass toolId for MockFailVerificationTool to trigger verification failure
  const req4: SpendingRequest = { amount: 100, allocationId: 'alloc-marketing', purpose: 'Failing payment' };
  await runtime.processGoal(
    { ...baseGoal, id: 'g4', targetState: { toolId: 'mock-fail-verification-tool' } }, 
    allowedScope, 
    'execute_payment', 
    {}, 
    req4
  );
  console.log('Treasury State:', treasuryService.getAllocation('alloc-marketing'));

  console.log('\n--- Final Runtime State ---');
  const mem = runtime.getMemory();
  console.log('Memory Events Length:', mem.length);
  // Log payment events specifically to show lifecycle
  console.log('Payment Events logged:', mem.filter(e => e.type.startsWith('PAYMENT_')).map(e => e.type));
  
  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);

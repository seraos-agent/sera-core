import { Runtime } from './runtime/Runtime';
import { Goal } from './core/goals/types';
import { DelegationScope } from './delegation/types';
import { WorkerManager } from './workers/WorkerManager';
import { ToolWorker } from './workers/ToolWorker';
import { ToolRegistry } from './tools/ToolRegistry';
import { ToolRuntime } from './tools/ToolRuntime';
import { VerificationService } from './tools/VerificationService';
import { MockReadTool } from './tools/MockReadTool';
import { ConstitutionEngine } from './constitution/ConstitutionEngine';
import { DestructiveActionRule } from './constitution/rules/DestructiveActionRule';
import { IrreversibleActionRule } from './constitution/rules/IrreversibleActionRule';
import { UnsafeActionRule } from './constitution/rules/UnsafeActionRule';

async function main() {
  console.log('=== SERA Core - Stage 2.4: Constitution Engine Demo ===');
  
  // Setup Tool Layer
  const registry = new ToolRegistry();
  registry.register(new MockReadTool());
  const toolRuntime = new ToolRuntime(registry);
  const verificationService = new VerificationService();

  // Setup Execution Layer
  const workerManager = new WorkerManager();
  const worker = new ToolWorker('demo-worker', toolRuntime, verificationService);
  workerManager.register(worker);

  // Setup Constitution Engine
  const constitutionEngine = new ConstitutionEngine();
  constitutionEngine.register(new DestructiveActionRule());
  constitutionEngine.register(new IrreversibleActionRule());
  constitutionEngine.register(new UnsafeActionRule());

  // Setup Decision Layer
  const runtime = new Runtime(workerManager, constitutionEngine);
  
  const principalId = 'user-999';

  const goal: Goal = {
    id: `goal-${Date.now()}`,
    description: 'Execute a delegated task',
    targetState: { testCompleted: true },
    status: 'PENDING',
    createdAt: Date.now()
  };

  const allowedScope: DelegationScope = {
    id: 'scope-allowed',
    principalId,
    allowedPermissions: [{ action: 'execute_safe' }, { action: 'delete_file' }, { action: 'irreversible_action' }, { action: 'execute_unsafe' }],
    requiresApprovalPermissions: [],
  };
  
  const deniedScope: DelegationScope = {
    id: 'scope-denied',
    principalId,
    allowedPermissions: [],
    requiresApprovalPermissions: [],
  };

  console.log('\n--- Case 1: Constitution ALLOWED, Authority ALLOWED ---');
  await runtime.processGoal(goal, allowedScope, 'execute_safe');

  console.log('\n--- Case 2: Constitution REQUIRES_CONFIRMATION, Authority ALLOWED ---');
  await runtime.processGoal(goal, allowedScope, 'delete_file'); // DestructiveActionRule triggers

  console.log('\n--- Case 3: Constitution DENIED, Authority ALLOWED ---');
  await runtime.processGoal(goal, allowedScope, 'execute_unsafe', { unsafe: true }); // UnsafeActionRule triggers

  console.log('\n--- Case 4: Constitution ALLOWED, Authority DENIED ---');
  await runtime.processGoal(goal, deniedScope, 'execute_safe'); // Auth DENIED triggers

  console.log('\n--- Final Runtime State ---');
  console.log('Memory Events Length:', runtime.getMemory().length);
  
  console.log('\n=== Demo Completed Successfully ===');
}

main().catch(console.error);

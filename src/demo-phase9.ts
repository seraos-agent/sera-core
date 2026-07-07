import { EventEmitter } from 'node:events';
import { AuditLogger } from './core/telemetry/AuditLogger';
import { EventTypes } from './core/events/types';
import fs from 'node:fs';
import path from 'node:path';

async function testAuditLogger() {
  const eventBus = new EventEmitter();
  const logger = new AuditLogger(eventBus);

  console.log('Emitting SYSTEM_TELEMETRY event...');
  eventBus.emit('SYSTEM_TELEMETRY' as any, {
    metric: 'tool_execution',
    toolName: 'CHECK_WALLET_BALANCE',
    success: true,
    durationMs: 120
  });

  console.log('Emitting DIALOGUE_PROPOSAL_GENERATED event...');
  eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_GENERATED, {
    proposalId: 'prop-1234',
    intent: 'TRANSFER_FUNDS',
    parameters: { amount: '10', recipient: 'Alice' }
  });

  // Give fs.appendFile a moment to flush
  await new Promise(resolve => setTimeout(resolve, 500));

  const logPath = path.join(process.cwd(), '.data', 'audit.log');
  if (fs.existsSync(logPath)) {
    const logs = fs.readFileSync(logPath, 'utf8');
    console.log('\n--- audit.log contents ---');
    console.log(logs);
    console.log('--------------------------');
  } else {
    console.error('audit.log was not created!');
  }
}

testAuditLogger().catch(console.error);

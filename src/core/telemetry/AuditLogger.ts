import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { EventTypes } from '../events/types';

export class AuditLogger {
  private logPath: string;

  constructor(private eventBus: EventEmitter) {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.logPath = path.join(dataDir, 'audit.log');
    this.setupListeners();
  }

  private setupListeners() {
    this.eventBus.on('SYSTEM_TELEMETRY', (payload: any) => {
      this.writeLog('TELEMETRY', payload);
    });

    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, (event: any) => {
      this.writeLog('PROPOSAL_GENERATED', event);
    });
    
    // We can add GOAL_RESULT or EXECUTION_TRACE here when they are formally emitted
  }

  private writeLog(type: string, payload: any) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      payload
    };

    const line = JSON.stringify(logEntry) + '\n';
    
    // Non-blocking append
    fs.appendFile(this.logPath, line, (err) => {
      if (err) {
        console.error(`[AuditLogger] Failed to write log: ${err.message}`);
      }
    });
  }
}

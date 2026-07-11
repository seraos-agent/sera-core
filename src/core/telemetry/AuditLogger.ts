import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { EventTypes } from '../events/types';

export class AuditLogger {
  private logPath: string;
  private readonly RETENTION_DAYS = 30;

  constructor(private eventBus: EventEmitter) {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.logPath = path.join(dataDir, 'audit.log');
    this.setupListeners();
    this.cleanupOldLogs();
  }

  private setupListeners() {
    this.eventBus.on('SYSTEM_TELEMETRY', (payload: any) => {
      this.writeLog('TELEMETRY', payload);
    });

    this.eventBus.on(EventTypes.DIALOGUE_PROPOSAL_GENERATED, (event: any) => {
      this.writeLog('PROPOSAL_GENERATED', event);
    });
    
    this.eventBus.on(EventTypes.COMMUNICATION_OBSERVED, (event: any) => {
      this.writeLog('RAW_COMMUNICATION', event);
    });
  }

  private stripPII(payload: any): any {
    let serialized = JSON.stringify(payload);
    // Best-effort PII stripping (Emails, Phone numbers, Ethereum Addresses)
    serialized = serialized.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
    serialized = serialized.replace(/0x[a-fA-F0-9]{40}/g, '[ETH_ADDRESS_REDACTED]');
    serialized = serialized.replace(/\+?(\d{1,3})?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE_REDACTED]');
    
    try {
      return JSON.parse(serialized);
    } catch {
      return payload;
    }
  }

  private writeLog(type: string, payload: any) {
    const sanitizedPayload = this.stripPII(payload);
    const logEntry = {
      timestamp: new Date().toISOString(),
      type,
      payload: sanitizedPayload
    };

    const line = JSON.stringify(logEntry) + '\n';
    
    // Non-blocking append
    fs.appendFile(this.logPath, line, (err) => {
      if (err) {
        console.error(`[AuditLogger] Failed to write log: ${err.message}`);
      }
    });
  }

  private cleanupOldLogs() {
    // A simple file-based retention mechanism: rotate/delete if file is older than 30 days
    fs.stat(this.logPath, (err, stats) => {
      if (err) return;
      const now = new Date().getTime();
      const endTime = stats.mtime.getTime() + (this.RETENTION_DAYS * 24 * 60 * 60 * 1000);
      if (now > endTime) {
        fs.unlink(this.logPath, (err) => {
          if (!err) console.log('[AuditLogger] Old audit log removed due to 30-day retention policy.');
        });
      }
    });
  }
}

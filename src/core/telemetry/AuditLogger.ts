import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { EventTypes } from '../events/types';

export class AuditLogger {
  private logPath: string;
  private readonly RETENTION_DAYS = 30;
  private readonly persistLocally: boolean;
  private writeCount = 0;
  private readonly MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

  constructor(private eventBus: EventEmitter, options: { persistLocally?: boolean } = {}) {
    this.persistLocally = options.persistLocally ?? true;
    const dataDir = path.join(process.cwd(), '.data');
    if (this.persistLocally && !fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.logPath = path.join(dataDir, 'audit.log');
    this.setupListeners();
    if (this.persistLocally) this.cleanupOldLogs();
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

    this.eventBus.on(EventTypes.SECURITY_AUTH_FAILURE, (payload: any) => {
      this.writeLog('SECURITY_VIOLATION', payload);
    });

    this.eventBus.on(EventTypes.SECURITY_BLOCKED_ACTION, (payload: any) => {
      this.writeLog('GOVERNANCE_BLOCK', payload);
    });

    // Execution States
    const execEvents = [
      'system.execution.started', 'system.execution.progress', 
      'system.execution.paused', 'system.execution.resumed', 
      'system.execution.completed', 'system.execution.failed', 
      'system.execution.cancelled', 'system.execution.timeout_detected'
    ];
    for (const e of execEvents) {
      this.eventBus.on(e, (payload: any) => {
        this.writeLog('EXECUTION_STATE_CHANGED', { event: e, ...payload });
      });
    }
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
    if (!this.persistLocally) return;
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
    this.writeCount++;
    if (this.writeCount % 50 === 0) {
      this.checkRotation();
    }
  }

  private checkRotation() {
    if (!this.persistLocally) return;
    try {
      if (fs.existsSync(this.logPath)) {
        const stats = fs.statSync(this.logPath);
        if (stats.size > this.MAX_FILE_SIZE) {
          const oldPath = `${this.logPath}.old`;
          if (fs.existsSync(oldPath)) {
            try { fs.unlinkSync(oldPath); } catch {}
          }
          fs.renameSync(this.logPath, oldPath);
          console.log('[AuditLogger] Log rotated: audit.log exceeded 2MB, archived to audit.log.old');
        }
      }

      const oldPath = `${this.logPath}.old`;
      if (fs.existsSync(oldPath)) {
        const stats = fs.statSync(oldPath);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        if (stats.mtimeMs < sevenDaysAgo) {
          fs.unlinkSync(oldPath);
          console.log('[AuditLogger] Removed audit.log.old (> 7 days).');
        }
      }
    } catch (err: any) {
      console.warn('[AuditLogger] Log rotation check warning:', err.message);
    }
  }

  private cleanupOldLogs() {
    this.checkRotation();
  }
}

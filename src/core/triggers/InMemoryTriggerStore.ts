import { Trigger, TriggerStore } from './types';
import * as fs from 'fs';
import * as path from 'path';

export class InMemoryTriggerStore implements TriggerStore {
  private triggers: Map<string, Trigger> = new Map();
  private filePath: string;

  constructor() {
    this.filePath = path.join(process.cwd(), '.data', 'triggers.json');
    this.load();
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data) as Trigger[];
        parsed.forEach(t => this.triggers.set(t.id, t));
      }
    } catch (e) {
      console.error('[InMemoryTriggerStore] Failed to load triggers', e);
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.getAll(), null, 2));
    } catch (e) {
      console.error('[InMemoryTriggerStore] Failed to save triggers', e);
    }
  }

  save(trigger: Trigger): void {
    this.triggers.set(trigger.id, trigger);
    this.persist();
  }

  delete(id: string): void {
    this.triggers.delete(id);
    this.persist();
  }

  get(id: string): Trigger | undefined {
    return this.triggers.get(id);
  }

  getActiveTriggers(): Trigger[] {
    return Array.from(this.triggers.values()).filter(t => t.state === 'ACTIVE');
  }

  getAll(): Trigger[] {
    return Array.from(this.triggers.values());
  }
}

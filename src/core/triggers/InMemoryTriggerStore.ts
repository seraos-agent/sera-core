import { Trigger, TriggerStore } from './types';

export class InMemoryTriggerStore implements TriggerStore {
  private triggers: Map<string, Trigger> = new Map();

  save(trigger: Trigger): void {
    this.triggers.set(trigger.id, trigger);
  }

  delete(id: string): void {
    this.triggers.delete(id);
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

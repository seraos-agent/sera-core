import { StandardEvent } from './types';

export type EventHandler = (event: StandardEvent) => void | Promise<void>;

/**
 * A lightweight pub/sub event bus specifically for decoupled
 * execution signals between TriggerEngine and Runtime.
 */
export class ExecutionEventBus {
  private listeners: Map<string, EventHandler[]> = new Map();

  subscribe(eventType: string, handler: EventHandler): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, []);
    }
    this.listeners.get(eventType)!.push(handler);
  }

  unsubscribe(eventType: string, handler: EventHandler): void {
    const handlers = this.listeners.get(eventType);
    if (handlers) {
      this.listeners.set(
        eventType,
        handlers.filter((h) => h !== handler)
      );
    }
  }

  publish(event: StandardEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      // Fire and forget asynchronous execution of handlers
      for (const handler of handlers) {
        try {
          const result = handler(event);
          if (result instanceof Promise) {
            result.catch(err => {
              console.error(`[ExecutionEventBus] Error in async handler for event ${event.type}:`, err);
            });
          }
        } catch (err) {
          console.error(`[ExecutionEventBus] Error in sync handler for event ${event.type}:`, err);
        }
      }
    }
  }
}

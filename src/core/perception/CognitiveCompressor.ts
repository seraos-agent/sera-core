import { EventEmitter } from 'events';
import { EventTypes, StandardEvent, CognitiveObservationPayload, SignalLevel } from '../events/types';

/**
 * The CognitiveCompressor acts as the Heuristic Layer.
 * It buffers raw events, applies deterministic and heuristic rules (without LLM),
 * clusters repeated signals, and controls the Cognitive Budget for LLM reflections.
 */
export class CognitiveCompressor {
  private readonly eventBus: EventEmitter;
  private eventBuffer: StandardEvent[] = [];
  
  // Buffering window
  private readonly WINDOW_MS = 30000; // 30 seconds
  private windowTimer: NodeJS.Timeout | null = null;
  
  // Cognitive Budget
  private lastLlmReflectionTime = 0;
  private readonly LLM_COOLDOWN_MS = 60000; // Max 1 reflection per minute

  constructor(eventBus: EventEmitter) {
    this.eventBus = eventBus;
    this.bindListeners();
  }

  private bindListeners() {
    this.eventBus.on(EventTypes.DOMAIN_WALLET_STATE, (e) => this.ingestEvent(e));
    this.eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, (e) => this.ingestEvent(e));
    this.eventBus.on(EventTypes.SYSTEM_BOOT, (e) => this.ingestEvent(e));
    // Additional domain events...
  }

  /**
   * Deterministic Layer: Ingests raw events and stores them in the buffer.
   */
  public ingestEvent(event: StandardEvent): void {
    this.eventBuffer.push(event);

    // Apply immediate Escalation Rules if an event is highly critical (ALERT)
    const isCritical = this.evaluateImmediateEscalation(event);
    
    if (isCritical) {
      this.triggerReflection("Immediate Escalation");
      // Optionally flush immediately: this.compressWindow();
    } else if (!this.windowTimer) {
      // Start the compression window if not already running
      this.windowTimer = setTimeout(() => this.compressWindow(), this.WINDOW_MS);
    }
  }

  /**
   * Heuristic Rule: Does this single event warrant immediate escalation bypassing the buffer?
   */
  private evaluateImmediateEscalation(event: StandardEvent): boolean {
    if (event.type === EventTypes.DOMAIN_GOAL_RESULT && !event.payload.success) {
      // e.g. A failed transaction is an immediate alert
      return true;
    }
    return false;
  }

  /**
   * Heuristic Layer: Compresses the buffered events and flushes the cognitive stream.
   */
  private compressWindow(): void {
    this.windowTimer = null;
    if (this.eventBuffer.length === 0) return;

    const events = [...this.eventBuffer];
    this.eventBuffer = []; // Clear buffer

    // 1. Cluster identical event types
    const walletUpdates = events.filter(e => e.type === EventTypes.DOMAIN_WALLET_STATE);
    const goalResults = events.filter(e => e.type === EventTypes.DOMAIN_GOAL_RESULT);

    // 2. Deterministic Output (Zero LLM)
    if (walletUpdates.length > 0) {
       this.emitObservation({
         title: "State Synchronized",
         desc: `Wallet states synced ${walletUpdates.length} times in the last 30s.`,
         signal: SignalLevel.TRACE,
         color: "#6b7280" // Gray (noise)
       });
    }

    if (goalResults.length > 0) {
      const failures = goalResults.filter(e => !e.payload.success);
      if (failures.length > 1) {
        // Anomaly detected: Repeated failures
        this.emitObservation({
          title: "Execution Anomaly Detected",
          desc: `${failures.length} execution failures clustered in the current window.`,
          signal: SignalLevel.ALERT,
          color: "#ef4444" 
        });
        this.triggerReflection("Anomaly Cluster Detected");
      } else if (failures.length === 1) {
        this.emitObservation({
          title: "Execution Failed",
          desc: failures[0].payload.errorMessage || "Network rejected the action.",
          signal: SignalLevel.ALERT,
          color: "#ef4444"
        });
      } else {
        this.emitObservation({
          title: "Executions Confirmed",
          desc: `${goalResults.length} automated actions executed successfully.`,
          signal: SignalLevel.ACTION,
          color: "#10b981"
        });
      }
    }
  }

  /**
   * LLM Layer (Budgeted Reflection Trigger)
   */
  private triggerReflection(reason: string): void {
    const now = Date.now();
    if (now - this.lastLlmReflectionTime < this.LLM_COOLDOWN_MS) {
      console.log(`[CognitiveCompressor] 🚫 LLM Budget Exceeded. Skipping reflection for: ${reason}`);
      return;
    }

    this.lastLlmReflectionTime = now;
    console.log(`[CognitiveCompressor] 🧠 LLM Budget Spent. Triggering Semantic Reflection for: ${reason}`);
    
    // In a real system, this emits to DialogueEngine or SemanticReflector
    // this.eventBus.emit(EventTypes.TRIGGER_SEMANTIC_REFLECTION, { reason, buffer: [...this.eventBuffer] });
  }

  private emitObservation(payload: CognitiveObservationPayload): void {
    const observationEvent: StandardEvent<CognitiveObservationPayload> = {
      id: `obs-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type: EventTypes.COGNITIVE_OBSERVATION,
      source: 'CognitiveCompressor',
      timestamp: Date.now(),
      payload
    };
    this.eventBus.emit(EventTypes.COGNITIVE_OBSERVATION, observationEvent);
  }
}

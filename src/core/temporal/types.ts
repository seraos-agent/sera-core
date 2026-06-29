export interface TemporalContext {
  physicalTime: number;      // Chronos: Absolute wall-clock time
  cognitiveCycleId: number;  // Logos: Internal runtime tick
  eventVersion?: number;     // Kairos: Event clock for state transitions
}

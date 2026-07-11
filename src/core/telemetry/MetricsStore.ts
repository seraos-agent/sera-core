export interface SystemMetrics {
  reflection: {
    observedExperiences: number;
    patternsLearned: number;
    wrongPatterns: number;
    calibrationDelta: number;
    averageConfidenceError: number;
  };
  memory: {
    verified: number;
    superseded: number;
    invalidated: number;
    averageEvidenceCount: number;
    averageProvenanceQuality: number;
  };
  governance: {
    actionsReviewed: number;
    allowed: number;
    confirmationRequired: number;
    denied: number;
    falsePositive: number;
    falseNegative: number;
  };
  worker: {
    success: number;
    failure: number;
    goalCompletionRate: number;
  };
  execution: {
    totalExecuted: number;
    avgLatencyMs: number;
  };
}

export interface MetricsStore {
  getMetrics(): SystemMetrics;
  updateReflection(metrics: Partial<SystemMetrics['reflection']>): void;
  updateMemory(metrics: Partial<SystemMetrics['memory']>): void;
  updateGovernance(metrics: Partial<SystemMetrics['governance']>): void;
  updateWorker(metrics: Partial<SystemMetrics['worker']>): void;
  updateExecution(metrics: Partial<SystemMetrics['execution']>): void;
}

export class InMemoryMetricsStore implements MetricsStore {
  private metrics: SystemMetrics = {
    reflection: {
      observedExperiences: 0,
      patternsLearned: 0,
      wrongPatterns: 0,
      calibrationDelta: 0,
      averageConfidenceError: 0,
    },
    memory: {
      verified: 0,
      superseded: 0,
      invalidated: 0,
      averageEvidenceCount: 0, // Placeholder for Phase 6 Provenance
      averageProvenanceQuality: 0, // Placeholder for Phase 6 Provenance
    },
    governance: {
      actionsReviewed: 0,
      allowed: 0,
      confirmationRequired: 0,
      denied: 0,
      falsePositive: 0,
      falseNegative: 0,
    },
    worker: {
      success: 0,
      failure: 0,
      goalCompletionRate: 0,
    },
    execution: {
      totalExecuted: 0,
      avgLatencyMs: 0,
    },
  };

  getMetrics(): SystemMetrics {
    // Return a clone to prevent direct mutation
    return JSON.parse(JSON.stringify(this.metrics));
  }

  updateReflection(metrics: Partial<SystemMetrics['reflection']>): void {
    this.metrics.reflection = { ...this.metrics.reflection, ...metrics };
  }

  updateMemory(metrics: Partial<SystemMetrics['memory']>): void {
    this.metrics.memory = { ...this.metrics.memory, ...metrics };
  }

  updateGovernance(metrics: Partial<SystemMetrics['governance']>): void {
    this.metrics.governance = { ...this.metrics.governance, ...metrics };
  }

  updateWorker(metrics: Partial<SystemMetrics['worker']>): void {
    this.metrics.worker = { ...this.metrics.worker, ...metrics };
  }

  updateExecution(metrics: Partial<SystemMetrics['execution']>): void {
    this.metrics.execution = { ...this.metrics.execution, ...metrics };
  }
}

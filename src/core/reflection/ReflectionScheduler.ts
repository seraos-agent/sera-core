import { ReflectionEngine } from './ReflectionEngine';
import { ReflectionProposalProcessor } from './ReflectionProposalProcessor';

export class ReflectionScheduler {
  private cycleCount = 0;
  private readonly REFLECTION_INTERVAL = 5; // Run every 5 execution cycles

  constructor(
    private engine: ReflectionEngine,
    private processor: ReflectionProposalProcessor
  ) {}

  tick(): void {
    this.cycleCount++;
    if (this.cycleCount % this.REFLECTION_INTERVAL === 0) {
      console.log(`\n[ReflectionScheduler] Triggering reflection at cycle ${this.cycleCount}`);
      const proposals = this.engine.reflect();
      this.processor.process(proposals);
    }
  }
}

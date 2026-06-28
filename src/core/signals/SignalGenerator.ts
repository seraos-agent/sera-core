import { ExecutionTrace } from '../execution/types';
import { ControlSignal } from './types';

export class SignalGenerator {
  generate(trace: ExecutionTrace): ControlSignal[] {
    const signals: ControlSignal[] = [];

    // Success pattern
    if (trace.finalOutcome === 'SUCCESS' && trace.verificationResult) {
      signals.push({
        type: 'repeated_success_pattern',
        signalConfidence: 0.9,
        reasoning: `Goal executed and verified successfully based on reasoning: ${trace.causalLinks.goalDecisionReason}`,
        supportingEvidence: [trace.id],
        severity: 0.5
      });
    }

    // Verification mismatch
    if (trace.finalOutcome === 'SUCCESS' && !trace.verificationResult) {
      signals.push({
        type: 'verification_mismatch',
        signalConfidence: 0.85,
        reasoning: `Execution succeeded but verification failed. Tool: ${trace.causalLinks.toolSelectionReason}`,
        supportingEvidence: [trace.id],
        severity: 0.9
      });
    }

    // Failure
    if (trace.finalOutcome === 'FAILED') {
      signals.push({
        type: 'failure_rate_spike',
        signalConfidence: 0.7,
        reasoning: trace.causalLinks.failureHypothesis || 'Execution failed abruptly',
        supportingEvidence: [trace.id],
        severity: 0.8
      });
    }

    return signals;
  }
}

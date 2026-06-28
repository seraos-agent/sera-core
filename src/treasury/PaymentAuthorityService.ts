import { SpendingRequest, SpendingDecision } from './types';

export class PaymentAuthorityService {
  evaluate(request: SpendingRequest): SpendingDecision {
    console.log(`[PaymentAuthorityService] Evaluating spending request for $${request.amount}`);

    // Demonstration logic:
    if (request.metadata?.prohibited === true) {
      return {
        status: 'DENIED',
        reason: 'Spending is explicitly prohibited.',
        source: 'PaymentAuthorityService'
      };
    }

    if (request.amount > 1000) {
      return {
        status: 'REQUIRES_APPROVAL',
        reason: 'Amount exceeds automatic approval limit of $1000.',
        source: 'PaymentAuthorityService'
      };
    }

    return {
      status: 'AUTHORIZED',
      reason: 'Spending within authorized limits.',
      source: 'PaymentAuthorityService'
    };
  }
}

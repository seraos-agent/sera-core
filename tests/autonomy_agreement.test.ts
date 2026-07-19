import { describe, expect, it } from 'vitest';
import { AuthorityService } from '../src/delegation/AuthorityService';
import { AutonomyAgreementStore } from '../src/core/autonomy/AutonomyAgreementStore';

describe('Operating Agreement autonomy', () => {
  it('requires per-action approval in Assistant and pre-authorizes allowed actions in Full Access', () => {
    const store = new AutonomyAgreementStore();
    const assistant = store.activate({ principalId: 'user-1', title: 'Review portfolio', intent: 'portfolio.review', mode: 'ASSISTANT', permissions: ['invoke_tool'] });
    const fullAccess = store.activate({ principalId: 'user-1', title: 'Manage paper portfolio', intent: 'paper.trade', mode: 'FULL_ACCESS', permissions: ['invoke_tool'] });
    const authority = new AuthorityService();

    expect(authority.evaluate({ principalId: 'user-1', action: 'invoke_tool' }, store.toDelegationScope(assistant.id)).status).toBe('REQUIRES_APPROVAL');
    expect(authority.evaluate({ principalId: 'user-1', action: 'invoke_tool' }, store.toDelegationScope(fullAccess.id)).status).toBe('ALLOWED');
  });

  it('stops future authority immediately when an agreement is revoked', () => {
    const store = new AutonomyAgreementStore();
    const agreement = store.activate({ principalId: 'user-1', title: 'Manage paper portfolio', intent: 'paper.trade', mode: 'FULL_ACCESS', permissions: ['invoke_tool'] });
    store.revoke(agreement.id);

    expect(() => store.toDelegationScope(agreement.id)).toThrow(/not active/);
    expect(store.get(agreement.id)?.status).toBe('REVOKED');
  });

  it('only reports Full Access for actions explicitly named by an active agreement', () => {
    const store = new AutonomyAgreementStore();
    const agreement = store.activate({ principalId: 'user-1', title: 'Paper trading', intent: 'paper.trade', mode: 'FULL_ACCESS', permissions: ['PAPER_TRADE'] });

    expect(store.hasFullAccessFor('PAPER_TRADE')).toBe(true);
    expect(store.hasFullAccessFor('TRANSFER_FUNDS')).toBe(false);
    store.revoke(agreement.id);
    expect(store.hasFullAccessFor('PAPER_TRADE')).toBe(false);
  });

  it('never treats another principal\'s agreement as this user\'s authority', () => {
    const store = new AutonomyAgreementStore();
    store.activate({ principalId: 'user-a', title: 'Paper trading', intent: 'paper.trade', mode: 'FULL_ACCESS', permissions: ['PAPER_TRADE'] });

    expect(store.hasFullAccessFor('PAPER_TRADE', 'user-a')).toBe(true);
    expect(store.hasFullAccessFor('PAPER_TRADE', 'user-b')).toBe(false);
  });
});

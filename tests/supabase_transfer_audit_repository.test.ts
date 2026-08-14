import { describe, expect, it } from 'vitest';
import { SupabaseRestClient } from '../src/core/persistence/SupabaseRestClient';
import { SupabaseTransferAuditRepository } from '../src/core/persistence/SupabaseTransferAuditRepository';

describe('SupabaseTransferAuditRepository', () => {
  it('upserts one lifecycle record using the request idempotency key', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response('', { status: 201 });
    };
    const repository = new SupabaseTransferAuditRepository(
      new SupabaseRestClient('https://example.supabase.co', 'server-key', fetchMock),
    );

    await repository.record({
      userId: '11111111-1111-1111-1111-111111111111',
      idempotencyKey: 'transfer-1',
      approvalSource: 'GOVERNED_ACTION',
      sourceWallet: '0xABC',
      destinationWallet: '0xDEF',
      chain: 'base-mainnet',
      asset: 'usdc',
      amount: '1.25',
      status: 'BROADCAST',
      transactionHash: '0xtx',
      broadcastAt: new Date('2026-08-14T00:00:00.000Z'),
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toContain('/rest/v1/wallet_transfer_events?on_conflict=idempotency_key');
    expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
      idempotency_key: 'transfer-1',
      source_wallet: '0xabc',
      destination_wallet: '0xdef',
      asset: 'USDC',
      status: 'BROADCAST',
      transaction_hash: '0xtx',
    });
  });
});

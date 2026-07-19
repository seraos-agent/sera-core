import { describe, expect, it } from 'vitest';
import { ReownWalletIdentityService } from '../src/core/identity/ReownWalletIdentityService';
import { SupabaseRestClient } from '../src/core/persistence/SupabaseRestClient';

describe('ReownWalletIdentityService', () => {
  it('maps a verified wallet to one durable SERA user and provisions both wallet records', async () => {
    const identities: Array<{ user_id: string; subject: string }> = [];
    const wallets: Array<{ user_id: string; kind: string }> = [];
    const requests: string[] = [];
    const fetchMock: typeof fetch = async (url, init) => {
      const requestUrl = String(url);
      requests.push(requestUrl);
      if (requestUrl.includes('auth_identities?provider=')) {
        const match = identities.find(identity => requestUrl.includes(encodeURIComponent(identity.subject)));
        return new Response(JSON.stringify(match ? [{ id: 'identity-1', ...match, kind: 'EXTERNAL_WALLET', provider: 'reown_wallet', verified_at: new Date().toISOString() }] : []), { status: 200 });
      }
      if (requestUrl.includes('wallet_accounts?user_id=')) {
        const kind = requestUrl.includes('kind=eq.PERSONAL') ? 'PERSONAL' : 'AGENT';
        const wallet = wallets.find(entry => entry.kind === kind);
        return new Response(JSON.stringify(wallet ? [{ id: `wallet-${kind}`, ...wallet, provider: 'REOWN', chain: 'base-mainnet', status: 'READY', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] : []), { status: 200 });
      }
      if (requestUrl.includes('/rest/v1/auth_identities')) {
        const body = JSON.parse(String(init?.body));
        identities.push({ user_id: body.user_id, subject: body.subject });
      }
      if (requestUrl.includes('/rest/v1/wallet_accounts')) {
        const body = JSON.parse(String(init?.body));
        wallets.push({ user_id: body.user_id, kind: body.kind });
      }
      return new Response('', { status: 201 });
    };
    const service = new ReownWalletIdentityService(new SupabaseRestClient('https://example.supabase.co', 'server-key', fetchMock));

    const first = await service.resolveVerifiedWallet('0xAbC');
    const second = await service.resolveVerifiedWallet('0xabc');

    expect(first).toEqual(second);
    expect(first.personalWalletAddress).toBe('0xabc');
    expect(requests.filter(request => request.includes('/rest/v1/wallet_accounts')).length).toBe(6);
  });
});

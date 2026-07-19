import { describe, expect, it } from 'vitest';
import { SupabaseIdentityService } from '../src/core/identity/SupabaseIdentityService';
import { SupabaseRestClient } from '../src/core/persistence/SupabaseRestClient';

describe('SupabaseIdentityService', () => {
  it('uses only the verified Auth user ID and creates a Twin Wallet record', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith('/auth/v1/user')) {
        return new Response(JSON.stringify({ id: '11111111-1111-1111-1111-111111111111', app_metadata: { provider: 'google' } }), { status: 200 });
      }
      if (String(url).includes('wallet_accounts?user_id=')) return new Response('[]', { status: 200 });
      return new Response('', { status: 201 });
    };
    const service = new SupabaseIdentityService(new SupabaseRestClient('https://example.supabase.co', 'server-secret', fetchMock));

    const principal = await service.resolve('user-access-token', '0xAbC');

    expect(principal).toEqual({ userId: '11111111-1111-1111-1111-111111111111', personalWalletAddress: '0xabc' });
    expect(requests.some(request => request.url.includes('/rest/v1/sera_users'))).toBe(true);
    expect(requests.filter(request => request.url.includes('/rest/v1/wallet_accounts')).length).toBe(4);
    expect(requests.some(request => request.url.includes('server-secret'))).toBe(false);
  });
});

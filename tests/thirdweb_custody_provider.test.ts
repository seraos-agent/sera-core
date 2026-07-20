import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThirdwebCustodyProvider } from '../src/capabilities/wallet/ThirdwebCustodyProvider';

describe('ThirdwebCustodyProvider', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('provisions a stable Agent Wallet identifier without exposing a signing key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      result: { address: '0x1111111111111111111111111111111111111111' },
    }), { status: 200 }));
    globalThis.fetch = fetchMock;

    const provider = new ThirdwebCustodyProvider('test-secret');
    const first = await provider.initializeAgentWallet('user-42');
    const second = await provider.initializeAgentWallet('user-42');

    expect(first).toEqual({ address: '0x1111111111111111111111111111111111111111', network: 'Base Mainnet' });
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ identifier: 'sera-agent:user-42' }),
    });
  });

  it('rejects execution until the explicit testnet verification phase', async () => {
    const provider = new ThirdwebCustodyProvider('test-secret');
    await expect(provider.execute(
      { address: '0x1111111111111111111111111111111111111111', network: 'Base Mainnet' },
      {} as any,
    )).resolves.toMatchObject({ status: 'REJECTED' });
  });
});

import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits, erc20Abi } from 'viem';
import { useState } from 'react';
import type { ThemeType } from '../../theme';

// Common USDC addresses
const USDC_ADDRESS_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; 
// Note: In production, switch address based on active chain

export function WalletConnector({ theme, vaultAddress }: { theme: ThemeType, vaultAddress: string }) {
  const { isConnected, address, chain } = useAccount();
  const [amount, setAmount] = useState('10'); // Default to 10 USDC

  const { data: balanceData } = useReadContract({
    address: USDC_ADDRESS_BASE as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: {
      enabled: !!address,
    }
  });

  const { writeContract, data: hash, error: writeError, isPending } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  const handleDeposit = () => {
    if (!vaultAddress || !vaultAddress.startsWith('0x')) {
      alert("Invalid SERA Vault Address configured.");
      return;
    }
    
    writeContract({
      address: USDC_ADDRESS_BASE as `0x${string}`,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [vaultAddress as `0x${string}`, parseUnits(amount, 6)],
      account: address,
      chain: chain,
    });
  };

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.03)',
      border: `1px solid ${theme.border}`,
      borderRadius: '20px',
      padding: '24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3 style={{ margin: 0, color: theme.ink, fontSize: '1.2rem', fontWeight: 600 }}>External Wallet</h3>
          <p style={{ margin: '4px 0 0', color: theme.inkFaint, fontSize: '0.9rem' }}>Connect your Web3 wallet to fund SERA.</p>
        </div>
        <appkit-button />
      </div>

      {isConnected && (
        <div style={{
          borderTop: `1px solid ${theme.border}`,
          paddingTop: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <span style={{ color: theme.ink }}>Your USDC Balance:</span>
            <span style={{ color: theme.ink, fontWeight: 500 }}>
              {balanceData ? `${Number(formatUnits(balanceData as bigint, 6)).toFixed(2)} USDC` : 'Loading...'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <input 
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount in USDC"
              style={{
                flex: 1,
                padding: '12px 16px',
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                background: 'rgba(0,0,0,0.2)',
                color: theme.ink,
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: '1rem'
              }}
            />
            <button 
              onClick={handleDeposit}
              disabled={isPending || isConfirming || !amount}
              style={{
                padding: '0 24px',
                borderRadius: '12px',
                border: 'none',
                background: theme.accent,
                color: theme.bg,
                fontWeight: 600,
                cursor: (isPending || isConfirming) ? 'not-allowed' : 'pointer',
                opacity: (isPending || isConfirming) ? 0.7 : 1,
                transition: 'opacity 0.2s'
              }}
            >
              {isPending ? 'Signing...' : isConfirming ? 'Confirming...' : 'Deposit'}
            </button>
          </div>

          {writeError && (
            <p style={{ color: '#ef4444', fontSize: '0.85rem', margin: 0 }}>
              Error: {(writeError as any).shortMessage || writeError.message}
            </p>
          )}

          {isConfirmed && (
            <p style={{ color: '#10b981', fontSize: '0.85rem', margin: 0 }}>
              Deposit successful! View on BaseScan.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

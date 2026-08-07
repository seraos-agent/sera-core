import { useState } from "react";
import { X, Zap, Loader2, CheckCircle2 } from "lucide-react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseUnits } from "viem";
import type { ThemeType } from "../../theme";
import type { WalletState } from "../../hooks/useWallet";

interface BillingModalProps {
  theme: ThemeType;
  walletState?: WalletState;
  onClose: () => void;
}

export function BillingModal({ theme, walletState, onClose }: BillingModalProps) {
  const [amount, setAmount] = useState<number>(5);

  const tokens = walletState?.agentCredits ?? 0;
  const isUnlimited = tokens === -1;
  const vaultAddress = walletState?.vaultAddress;

  const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const erc20Abi = [
    {
      constant: false,
      inputs: [
        { name: "_to", type: "address" },
        { name: "_value", type: "uint256" }
      ],
      name: "transfer",
      outputs: [{ name: "", type: "bool" }],
      type: "function"
    }
  ] as const;

  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  const handleDeposit = () => {
    if (!vaultAddress) return;
    writeContract({
      address: USDC_BASE_MAINNET,
      abi: erc20Abi,
      functionName: "transfer",
      args: [vaultAddress as `0x${string}`, parseUnits(amount.toString(), 6)],
    } as any);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        onClick={onClose}
        style={{ position: "absolute", inset: 0, background: "rgba(0, 0, 0, 0.5)", backdropFilter: "blur(4px)" }}
      />
      <div style={{
        position: "relative",
        background: theme.surface,
        border: `1px solid ${theme.border}`,
        borderRadius: 16,
        width: 400,
        maxWidth: "90%",
        padding: 24,
        boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
      }}>
        <button
          onClick={onClose}
          style={{ position: "absolute", top: 16, right: 16, background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft }}
        >
          <X size={20} />
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(16, 185, 129, 0.1))",
            border: "1px solid rgba(34, 197, 94, 0.3)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Zap size={20} color="#22c55e" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: theme.ink }}>Agent Energy Core</h2>
            <p style={{ margin: 0, fontSize: 13, color: theme.inkSoft }}>Manage your computation tokens</p>
          </div>
        </div>

        <div style={{
          background: theme.surface2,
          borderRadius: 12,
          padding: 20,
          display: "flex", flexDirection: "column", gap: 8,
          marginBottom: 24,
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: theme.inkSoft, fontSize: 14 }}>Remaining Tokens</span>
            <span style={{ color: isUnlimited ? "#a855f7" : theme.ink, fontSize: 24, fontWeight: 700 }}>
              {isUnlimited ? "∞" : tokens.toLocaleString()}
            </span>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: theme.ink }}>Top Up Tokens</h3>
          <p style={{ margin: "0 0 16px 0", fontSize: 13, color: theme.inkSoft, lineHeight: 1.5 }}>
            Base rate: 1 USDC = 200,000 Tokens.<br />
            Tokens never expire.
          </p>

          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[1, 5, 10, 20].map(val => {
              let bonusTag = null;
              if (val === 5) bonusTag = "+20%";
              if (val === 10) bonusTag = "+30%";
              if (val === 20) bonusTag = "+50%";

              return (
                <button
                  key={val}
                  onClick={() => setAmount(val)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    position: "relative",
                    background: amount === val ? theme.accentSoft : theme.surface2,
                    border: `1px solid ${amount === val ? theme.accent : theme.border}`,
                    borderRadius: 8,
                    color: amount === val ? theme.accent : theme.ink,
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6
                  }}
                >
                  {bonusTag && (
                    <div style={{
                      position: "absolute",
                      top: -10,
                      right: -10,
                      background: "#ef4444",
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 800,
                      padding: "2px 6px",
                      borderRadius: 12,
                      boxShadow: "0 2px 4px rgba(239, 68, 68, 0.4)"
                    }}>
                      {bonusTag}
                    </div>
                  )}
                  <svg width={14} height={14} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    <path d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z" fill="#2775ca" />
                    <path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z" fill="#fff" />
                    <path d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z" fill="#fff" />
                  </svg>
                  {val}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleDeposit}
            disabled={isPending || isConfirming || isConfirmed || !vaultAddress}
            style={{
              width: "100%", padding: 14, borderRadius: 8,
              background: (isPending || isConfirming || !vaultAddress) ? theme.surface2 : isConfirmed ? theme.status : theme.accent,
              color: (isPending || isConfirming || !vaultAddress) ? theme.inkSoft : "#fff",
              border: (isPending || isConfirming || !vaultAddress) ? `1px solid ${theme.border}` : "none",
              fontWeight: 600, fontSize: 14,
              cursor: (isPending || isConfirming || isConfirmed || !vaultAddress) ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "opacity 0.2s"
            }}
          >
            {isPending ? (
              <>
                <Loader2 size={18} className="spin" /> Confirm in Wallet
              </>
            ) : isConfirming ? (
              <>
                <Loader2 size={18} className="spin" /> Waiting for block...
              </>
            ) : isConfirmed ? (
              <>
                <CheckCircle2 size={18} /> Deposit Confirmed!
              </>
            ) : (
              <>
                <svg width={18} height={18} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                  <path d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z" fill="#2775ca" />
                  <path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z" fill="#fff" />
                  <path d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z" fill="#fff" />
                </svg>
                Deposit {amount} USDC
              </>
            )}
          </button>
          {error && <div style={{ color: "#D04646", fontSize: 12, marginTop: 8, textAlign: "center" }}>{error.message.split("\n")[0]}</div>}
        </div>

      </div>
    </div>
  );
}

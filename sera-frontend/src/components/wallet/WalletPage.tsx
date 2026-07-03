import { useState } from "react";
import { X, Check, Copy, Activity } from "lucide-react";
import type { ThemeType } from "../../theme";
import { Socket } from "socket.io-client";
import type { WalletState } from "../../hooks/useWallet";

const UsdcLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z" fill="#2775ca"/>
    <path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z" fill="#fff"/>
    <path d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z" fill="#fff"/>
  </svg>
);

interface WalletPageProps {
  theme: ThemeType;
  walletState: WalletState;
  onBack: () => void;
  socket: Socket | null;
}

export function WalletPage({ theme, walletState, onBack, socket }: WalletPageProps) {
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"toSera" | "toPersonal">("toSera");
  const [step, setStep] = useState<"input" | "confirm" | "pending" | "success" | "failed">("input");
  const [txHash, setTxHash] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const agentAddr = walletState.fullAddress || "";
  const vaultAddr = walletState.vaultAddress || "";
  const shortAgent = agentAddr ? agentAddr.slice(0, 6) + "..." + agentAddr.slice(-4) : "—";
  const shortVault = vaultAddr ? vaultAddr.slice(0, 6) + "..." + vaultAddr.slice(-4) : "—";
  const parsedAgentBalance = parseFloat(walletState.balance) || 0;
  const parsedVaultBalance = parseFloat(walletState.vaultBalance) || 0;
  const parsedAmount = parseFloat(amount) || 0;

  const activeBalance = direction === "toSera" ? parsedAgentBalance : parsedVaultBalance;

  const fromLabel = direction === "toSera" ? "Personal" : "Sera";
  const toLabel = direction === "toSera" ? "Sera" : "Personal";
  const toAddr = direction === "toSera" ? vaultAddr : agentAddr;
  const isValid = parsedAmount > 0 && parsedAmount <= activeBalance;

  const handleConfirm = () => {
    if (!isValid) return;
    setStep("confirm");
  };

  const handleSend = () => {
    if (!socket) {
      setErrorMsg("Not connected to server.");
      setStep("failed");
      return;
    }
    setStep("pending");
    socket.emit("wallet:transfer", { to: toAddr, amount: parsedAmount.toString(), asset: "USDC" });

    const onResult = (result: any) => {
      socket.off("wallet:transfer:result", onResult);
      if (result.status === "SUCCESS") {
        setTxHash(result.transactionHash || "");
        setStep("success");
      } else {
        setErrorMsg(result.error || result.reason || "Transfer failed.");
        setStep("failed");
      }
    };
    socket.on("wallet:transfer:result", onResult);
    setTimeout(() => {
      socket.off("wallet:transfer:result", onResult);
      if (step === "pending") {
        setErrorMsg("Request timed out. Check network.");
        setStep("failed");
      }
    }, 60000);
  };

  const handleReset = () => {
    setAmount("");
    setTxHash("");
    setErrorMsg("");
    setStep("input");
  };

  const copyTx = () => {
    navigator.clipboard.writeText(txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: theme.bg, overflowY: "auto", position: "relative" }}>
      <style>{`
        @keyframes walletPageIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: `1px solid ${theme.border}`, background: theme.surface, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", borderRadius: 6 }}>
          <X size={20} />
        </button>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: theme.ink }}>Wallet</span>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", width: "100%", padding: "48px 24px", animation: "walletPageIn 220ms ease forwards" }}>

        {/* ── Balance Card ── */}
        <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, marginBottom: 32, overflow: "hidden" }}>
          {/* Total Balance */}
          <div style={{ padding: "24px 28px 20px" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>Total Balance</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: 38, fontWeight: 500, color: theme.ink, letterSpacing: -0.5, lineHeight: 1, display: "flex", alignItems: "center", gap: 10 }}>
              {(parsedAgentBalance + parsedVaultBalance).toFixed(2)}
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: theme.surface2, padding: "4px 8px 4px 6px", borderRadius: 20, border: `1px solid ${theme.border}` }}>
                <UsdcLogo size={20} />
                <span style={{ fontSize: 13, fontWeight: 600, color: theme.ink }}>USDC</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: theme.status }} />
              <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: theme.inkFaint }}>Base Mainnet</span>
            </div>
          </div>

          {/* Breakdown */}
          <div style={{ display: "flex", borderTop: `1px solid ${theme.border}` }}>
            <div style={{
              flex: 1, padding: "16px 28px",
              borderRight: `1px solid ${theme.border}`,
              background: direction === "toSera" ? theme.accentSoft : "transparent",
              transition: "background 200ms",
            }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 600, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Personal</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 600, color: direction === "toSera" ? theme.accent : theme.ink }}>
                {parsedAgentBalance.toFixed(2)}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.inkFaint, marginTop: 4 }}>{shortAgent}</div>
            </div>
            <div style={{
              flex: 1, padding: "16px 28px",
              background: direction === "toPersonal" ? theme.accentSoft : "transparent",
              transition: "background 200ms",
            }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 600, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Sera</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 18, fontWeight: 600, color: direction === "toPersonal" ? theme.accent : theme.ink }}>
                {parsedVaultBalance.toFixed(2)}
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.inkFaint, marginTop: 4 }}>{shortVault || "—"}</div>
            </div>
          </div>
        </div>

        {/* ── Transfer Panel ── */}
        <div style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, overflow: "hidden" }}>

          {/* Section label */}
          <div style={{ padding: "20px 24px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 1.2 }}>Internal Transfer</span>
            {step !== "input" && step !== "confirm" && (
              <button onClick={handleReset} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.accent, fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, padding: 0 }}>New Transfer</button>
            )}
          </div>

          <div style={{ padding: "16px 24px 24px" }}>

            {/* ─ STEP: input ─ */}
            {(step === "input" || step === "confirm") && (
              <>
                {/* Direction selector */}
                <div style={{ display: "flex", borderRadius: 10, overflow: "hidden", border: `1px solid ${theme.border}`, marginBottom: 20 }}>
                  {(["toSera", "toPersonal"] as const).map(dir => (
                    <button key={dir} onClick={() => { setDirection(dir); setStep("input"); }}
                      style={{
                        flex: 1, padding: "10px 0", border: "none", cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, transition: "background 180ms, color 180ms",
                        background: direction === dir ? theme.accent : "transparent",
                        color: direction === dir ? theme.accentInk : theme.inkSoft,
                      }}>
                      {dir === "toSera" ? "Personal → Sera" : "Sera → Personal"}
                    </button>
                  ))}
                </div>

                {/* Route visualization */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, padding: "14px 16px", background: theme.surface2, borderRadius: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>From</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: theme.ink }}>{fromLabel}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.inkFaint, marginTop: 2 }}>{direction === "toSera" ? shortAgent : shortVault}</div>
                  </div>
                  <Activity size={16} color={theme.inkFaint} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, textAlign: "right" }}>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 10, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 }}>To</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, color: theme.accent }}>{toLabel}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.inkFaint, marginTop: 2 }}>{direction === "toSera" ? shortVault : shortAgent}</div>
                  </div>
                </div>

                {/* Amount input */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", padding: "0 16px", borderRadius: 10, background: theme.surface2, border: `1.5px solid ${parsedAmount > activeBalance ? "#ef4444" : (parsedAmount > 0 ? theme.accent : theme.border)}`, height: 56, transition: "border-color 200ms" }}>
                    <input
                      type="number" placeholder="0.00" value={amount}
                      onChange={e => { setAmount(e.target.value); setStep("input"); }}
                      style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "Inter, sans-serif", fontSize: 22, fontWeight: 500, color: theme.ink, width: 0 }}
                    />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => setAmount(activeBalance.toString())}
                        style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: theme.accent, background: theme.accentSoft, border: "none", cursor: "pointer", padding: "3px 8px", borderRadius: 6, letterSpacing: 0.5 }}>
                        MAX
                      </button>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, background: theme.surface, padding: "4px 8px 4px 6px", borderRadius: 20, border: `1px solid ${theme.border}` }}>
                        <UsdcLogo size={18} />
                        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: theme.ink }}>USDC</span>
                      </div>
                    </div>
                  </div>
                  {parsedAmount > activeBalance && (
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#ef4444", marginTop: 6, paddingLeft: 4 }}>
                      Insufficient balance — max {activeBalance.toFixed(2)} USDC
                    </div>
                  )}
                </div>

                {/* CTA */}
                {step === "input" && (
                  <button onClick={handleConfirm} disabled={!isValid}
                    style={{
                      width: "100%", height: 48, borderRadius: 10, border: "none", fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600,
                      background: isValid ? theme.accent : theme.surface2,
                      color: isValid ? theme.accentInk : theme.inkFaint,
                      cursor: isValid ? "pointer" : "default", transition: "background 200ms, color 200ms",
                    }}>
                    Review Transfer
                  </button>
                )}

                {/* Confirmation step */}
                {step === "confirm" && (
                  <div style={{ marginTop: 4 }}>
                    <div style={{ background: theme.surface2, borderRadius: 10, padding: "16px", marginBottom: 16 }}>
                      <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, color: theme.inkFaint, textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>Confirm Transfer</div>
                      {[
                        ["Amount", `${parsedAmount.toFixed(2)} USDC`],
                        ["From", fromLabel],
                        ["To", toLabel],
                        ["Network", "Base Mainnet"],
                      ].map(([label, value]) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft }}>{label}</span>
                          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: theme.ink }}>{value}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setStep("input")}
                        style={{ flex: 1, height: 46, borderRadius: 10, border: `1px solid ${theme.border}`, background: "transparent", color: theme.ink, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                        Back
                      </button>
                      <button onClick={handleSend}
                        style={{ flex: 2, height: 46, borderRadius: 10, border: "none", background: theme.accent, color: theme.accentInk, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                        Confirm & Send
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ─ STEP: pending ─ */}
            {step === "pending" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0", gap: 16 }}>
                <span style={{ display: "inline-block", width: 32, height: 32, border: `3px solid ${theme.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 700ms linear infinite" }} />
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: theme.ink }}>Broadcasting...</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkFaint }}>Waiting for on-chain confirmation</div>
              </div>
            )}

            {/* ─ STEP: success ─ */}
            {step === "success" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 0", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#16a34a22", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Check size={22} color="#16a34a" />
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 700, color: theme.ink }}>Transfer Complete</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkFaint }}>{parsedAmount.toFixed(2)} USDC sent to {toLabel}</div>
                {txHash && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, background: theme.surface2, borderRadius: 8, padding: "10px 14px", width: "100%", boxSizing: "border-box" }}>
                      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: theme.inkFaint, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{txHash}</span>
                      <button onClick={copyTx} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 2, display: "flex", flexShrink: 0 }}>
                        {copied ? <Check size={14} color={theme.status} /> : <Copy size={14} />}
                      </button>
                    </div>
                    <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.accent, textDecoration: "none", fontWeight: 500 }}>
                      View on Basescan ↗
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* ─ STEP: failed ─ */}
            {step === "failed" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "28px 0", gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#ef444422", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={22} color="#ef4444" />
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 700, color: theme.ink }}>Transfer Failed</div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#ef4444", textAlign: "center" }}>{errorMsg}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

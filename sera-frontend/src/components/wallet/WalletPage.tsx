import { useState } from "react";
import { ChevronLeft as CloseIcon, X, Check } from "lucide-react";
import type { ThemeType } from "../../theme";
import { Socket } from "socket.io-client";
import type { WalletState } from "../../hooks/useWallet";


const UsdcLogo = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 2000 2000" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M1000 2000c554.17 0 1000-445.83 1000-1000S1554.17 0 1000 0 0 445.83 0 1000s445.83 1000 1000 1000z" fill="#2775ca" />
    <path d="M1275 1158.33c0-145.83-87.5-195.83-262.5-216.66-125-16.67-150-50-150-108.34s41.67-95.83 125-95.83c75 0 116.67 25 137.5 87.5 4.17 12.5 16.67 20.83 29.17 20.83h66.66c16.67 0 29.17-12.5 29.17-29.16v-4.17c-16.67-91.67-91.67-162.5-187.5-170.83v-100c0-16.67-12.5-29.17-33.33-33.34h-62.5c-16.67 0-29.17 12.5-33.34 33.34v95.83c-125 16.67-204.16 100-204.16 204.17 0 137.5 83.33 191.66 258.33 212.5 116.67 20.83 154.17 45.83 154.17 112.5s-58.34 112.5-137.5 112.5c-108.34 0-145.84-45.84-158.34-108.34-4.16-16.66-16.66-25-29.16-25h-70.84c-16.66 0-29.16 12.5-29.16 29.17v4.17c16.66 104.16 83.33 179.16 220.83 200v100c0 16.66 12.5 29.16 33.33 33.33h62.5c16.67 0 29.17-12.5 33.34-33.33v-100c125-20.84 208.33-108.34 208.33-220.84z" fill="#fff" />
    <path d="M787.5 1595.83c-325-116.66-491.67-479.16-370.83-800 62.5-175 200-308.33 370.83-370.83 16.67-8.33 25-20.83 25-41.67V325c0-16.67-8.33-29.17-25-33.33-4.17 0-12.5 0-16.67 4.16-395.83 125-612.5 545.84-487.5 941.67 75 233.33 254.17 412.5 487.5 487.5 16.67 8.33 33.34 0 37.5-16.67 4.17-4.16 4.17-8.33 4.17-16.66v-58.34c0-12.5-12.5-29.16-25-37.5zM1229.17 295.83c-16.67-8.33-33.34 0-37.5 16.67-4.17 4.17-4.17 8.33-4.17 16.67v58.33c0 16.67 12.5 33.33 25 41.67 325 116.66 491.67 479.16 370.83 800-62.5 175-200 308.33-370.83 370.83-16.67 8.33-25 20.83-25 41.67V1700c0 16.67 8.33 29.17 25 33.33 4.17 0 12.5 0 16.67-4.16 395.83-125 612.5-545.84 487.5-941.67-75-237.5-258.34-416.67-487.5-491.67z" fill="#fff" />
  </svg>
);

interface WalletPageProps {
  theme: ThemeType;
  walletState: WalletState;
  onBack: () => void;
  socket: Socket | null;
  isMobileView?: boolean;
}

export function WalletPage({ theme, walletState, onBack, socket, isMobileView }: WalletPageProps) {
  const sidePad = isMobileView ? 16 : 32;
  const titleSize = isMobileView ? 20 : 24;
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"toSera" | "toPersonal">("toSera");
  const [step, setStep] = useState<"input" | "confirm" | "pending" | "success" | "failed">("input");
  const [txHash, setTxHash] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

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
        let cleanError = result.error || result.reason || "Transfer failed.";
        if (typeof cleanError === "string") {
          if (cleanError.includes("transfer amount exceeds balance") || cleanError.includes("insufficient funds")) {
            cleanError = "Insufficient balance for this transfer.";
          } else if (cleanError.includes("Details:")) {
            const match = cleanError.match(/Details:\s*([^\n]+)/);
            if (match) cleanError = match[1];
          }
          cleanError = cleanError.split('\n')[0].split('Request Arguments:')[0].trim();
        }
        setErrorMsg(cleanError);
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



  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: theme.bg, position: "relative", minWidth: 0, minHeight: 0 }}>
      <style>{`
        @keyframes walletPageIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobileView ? "12px 16px" : "12px 24px", borderBottom: "none", background: theme.bg, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "transparent", border: "none", cursor: "pointer", color: theme.inkSoft, padding: 4, display: "flex", borderRadius: 6 }}>
          <CloseIcon size={18} />
        </button>
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 15, color: theme.ink }}>Manage Money</span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {/* ── Main Container ── */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", animation: "walletPageIn 220ms ease forwards" }}>

          {/* Title Area */}
          <div style={{ padding: `${isMobileView ? 24 : 32}px ${sidePad}px 8px`, flexShrink: 0 }}>
            <div style={{ marginBottom: 0 }}>
              <h1 style={{ margin: 0, fontSize: titleSize, fontWeight: 600, color: theme.ink, fontFamily: "Inter, sans-serif", letterSpacing: "-0.5px" }}>Manage Money</h1>
              <p style={{ margin: "4px 0 0", fontSize: 14, color: theme.inkSoft, fontFamily: "Inter, sans-serif" }}>
                Assets and transactions Sera is currently managing for you.
              </p>
            </div>
          </div>

          {/* ── Sticky Services Tabs ── */}
          <div style={{
            display: 'flex', gap: 12, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center",
            position: 'sticky', top: -1, zIndex: 10,
            background: theme.bg, padding: `16px ${sidePad}px 16px`
          }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button style={{
                padding: '8px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
                background: theme.border, color: theme.ink, transition: 'all 0.2s'
              }}>
                Base Network
              </button>
            </div>

            <div style={{ display: "flex" }}>
              {/* @ts-expect-error - Web component from Web3Modal */}
              <w3m-button />
            </div>
          </div>

          {/* ── Scrollable Content ── */}
          <div style={{ padding: `0 ${sidePad}px ${sidePad}px`, display: "flex", flexDirection: "column" }}>
            {/* ── Flat Theme-Aware Card ── */}
            <div style={{
              background: theme.surface,
              borderRadius: 24, padding: isMobileView ? "16px" : "28px 24px 24px", position: "relative", overflow: "hidden", marginBottom: isMobileView ? 20 : 32,
              border: `1px solid ${theme.border}`
            }}>
              <div style={{ position: "relative", zIndex: 1 }}>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 500, color: theme.inkFaint, marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Total Balance</span>
                  <span style={{ background: theme.surface2, color: theme.inkSoft, padding: "4px 10px", borderRadius: 12, fontSize: 10, letterSpacing: 0.5, fontWeight: 700 }}>BASE MAINNET</span>
                </div>

                <div style={{ fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 32 : 46, fontWeight: 600, letterSpacing: "-1px", display: "flex", alignItems: "center", gap: 10, marginBottom: 4, color: theme.ink }}>
                  ${(parsedAgentBalance + parsedVaultBalance).toFixed(2)}
                  <span style={{ fontSize: isMobileView ? 14 : 16, fontWeight: 600, color: theme.inkSoft }}>USDC</span>
                </div>

                {walletState.syncing && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, border: `2px solid ${theme.accent}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 700ms linear infinite", flexShrink: 0 }} />
                    <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: theme.accent }}>Syncing balance...</span>
                  </div>
                )}

                {/* Nested Bento for accounts */}
                <div style={{ display: "flex", gap: isMobileView ? 8 : 12, marginTop: isMobileView ? 20 : 32 }}>
                  <div style={{ flex: 1, background: theme.surface2, borderRadius: 16, padding: isMobileView ? "10px 12px" : "14px 16px", border: `1px solid ${theme.border}` }}>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, color: theme.inkSoft, marginBottom: 8 }}>Personal</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 16 : 18, fontWeight: 600, color: theme.ink }}>{parsedAgentBalance.toFixed(2)}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.inkFaint, marginTop: 4 }}>{shortAgent}</div>
                  </div>
                  <div style={{ flex: 1, background: theme.surface2, borderRadius: 16, padding: isMobileView ? "10px 12px" : "14px 16px", border: `1px solid ${theme.border}` }}>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 500, color: theme.inkSoft, marginBottom: 8 }}>Sera</div>
                    <div style={{ fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 16 : 18, fontWeight: 600, color: theme.ink }}>{parsedVaultBalance.toFixed(2)}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: theme.inkFaint, marginTop: 4 }}>{shortVault || "—"}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Transfer Panel ── */}
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, color: theme.ink, marginBottom: 12 }}>Internal Transfer</div>

              <div style={{ background: theme.surface, borderRadius: 20, border: `1px solid ${theme.border}`, padding: isMobileView ? "14px" : "20px" }}>

                {/* ─ STEP: input ─ */}
                {(step === "input" || step === "confirm") && (
                  <>
                    {/* Direction selector */}
                    <div style={{ display: "flex", borderRadius: 12, background: theme.surface2, padding: 4, gap: 4, marginBottom: 24 }}>
                      {(["toSera", "toPersonal"] as const).map(dir => (
                        <button key={dir} onClick={() => { setDirection(dir); setStep("input"); }}
                          style={{
                            flex: 1, padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer",
                            fontFamily: "Inter, sans-serif", fontSize: 13, fontWeight: 600, transition: "all 200ms ease",
                            background: direction === dir ? theme.bg : "transparent",
                            color: direction === dir ? theme.ink : theme.inkSoft,
                            boxShadow: direction === dir ? "0 2px 8px rgba(0,0,0,0.04)" : "none"
                          }}>
                          {dir === "toSera" ? (isMobileView ? "Deposit" : "Deposit to Sera") : (isMobileView ? "Withdraw" : "Withdraw to Personal")}
                        </button>
                      ))}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkSoft }}>Amount</span>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.inkFaint }}>Available: {activeBalance.toFixed(2)} USDC</span>
                    </div>

                    {/* Amount input */}
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: "flex", alignItems: "center", paddingBottom: 8, borderBottom: `2px solid ${parsedAmount > activeBalance ? "#ef4444" : theme.inkSoft}`, transition: "border-color 200ms" }}>
                        <input
                          type="number" placeholder="0.00" value={amount}
                          onChange={e => { setAmount(e.target.value); setStep("input"); }}
                          style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontFamily: "Inter, sans-serif", fontSize: isMobileView ? 24 : 36, fontWeight: 600, color: theme.ink, width: 0 }}
                        />
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                          <button onClick={() => setAmount(activeBalance.toString())}
                            style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, color: theme.inkSoft, background: theme.surface2, border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: 20 }}>
                            MAX
                          </button>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, background: theme.surface2, padding: "4px 10px 4px 6px", borderRadius: 20 }}>
                            <UsdcLogo size={20} />
                            <span style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600, color: theme.ink }}>USDC</span>
                          </div>
                        </div>
                      </div>
                      {parsedAmount > activeBalance && (
                        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#ef4444", marginTop: 8 }}>
                          Insufficient balance
                        </div>
                      )}
                    </div>

                    {/* CTA */}
                    {step === "input" && (
                      <button onClick={handleConfirm} disabled={!isValid}
                        style={{
                          width: "100%", height: 52, borderRadius: 16, border: "none", fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 600,
                          background: isValid ? theme.accent : theme.surface2,
                          color: isValid ? theme.accentInk : theme.inkFaint,
                          cursor: isValid ? "pointer" : "default", transition: "all 200ms ease",
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
                        <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: theme.accent, textDecoration: "none", fontWeight: 500 }}>
                          View on Basescan
                        </a>
                      </div>
                    )}
                    <button onClick={handleReset} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 12, border: `1px solid ${theme.border}`, background: "transparent", color: theme.ink, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 200ms" }}>
                      Done
                    </button>
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
                    <button onClick={handleReset} style={{ marginTop: 16, padding: "10px 24px", borderRadius: 12, border: `1px solid ${theme.border}`, background: "transparent", color: theme.ink, fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer", transition: "background 200ms" }}>
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

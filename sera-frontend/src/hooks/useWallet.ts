import { useState, useCallback } from "react";

export const INITIAL_WALLET = {
  address: "Connecting...",
  fullAddress: "Connecting...",
  balance: "...",
  vaultBalance: "...",
  chain: "Base Mainnet",
  vaultAddress: "",
  syncing: false,
};

export type WalletState = typeof INITIAL_WALLET;

export function useWallet() {
  const [walletState, setWalletState] = useState<WalletState>(INITIAL_WALLET);
  const [walletCopied, setWalletCopied] = useState(false);

  const handleCopyWallet = useCallback((fullAddress: string) => {
    navigator.clipboard.writeText(fullAddress);
    setWalletCopied(true);
    setTimeout(() => setWalletCopied(false), 1500);
  }, []);

  return {
    walletState,
    setWalletState,
    walletCopied,
    handleCopyWallet,
  };
}

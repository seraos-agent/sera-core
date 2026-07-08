export const WALLET_LABELS: Record<string, string> = {
  USER_MAIN_WALLET: "Your Wallet",
  SERA_VAULT: "My Balance"
};

export function getWalletLabel(recipient: any): string {
  if (!recipient) return 'Not set yet ⚠️';
  if (typeof recipient === 'string') return recipient;
  if (typeof recipient === 'object') {
    if (recipient.type === 'EXTERNAL_ADDRESS') {
      const addr = recipient.address || 'Unknown Address';
      if (addr.startsWith('0x') && addr.length === 42) {
        return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
      }
      return addr;
    }
    return WALLET_LABELS[recipient.type] || recipient.type;
  }
  return 'Not set yet ⚠️';
}

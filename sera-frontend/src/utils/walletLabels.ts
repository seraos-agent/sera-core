export const WALLET_LABELS: Record<string, string> = {
  USER_MAIN_WALLET: "Your Main Wallet",
  SERA_VAULT: "SERA Vault"
};

export function getWalletLabel(recipient: any): string {
  if (!recipient) return 'Not set yet ⚠️';
  if (typeof recipient === 'string') return recipient;
  if (typeof recipient === 'object') {
    if (recipient.type === 'EXTERNAL_ADDRESS') {
      return recipient.address || 'Unknown Address';
    }
    return WALLET_LABELS[recipient.type] || recipient.type;
  }
  return 'Not set yet ⚠️';
}

export type RecipientType = 'USER_MAIN_WALLET' | 'SERA_VAULT' | 'EXTERNAL_ADDRESS';

export interface RecipientCanonical {
  type: RecipientType;
  address?: string; // Must be present if type === 'EXTERNAL_ADDRESS'
}

export interface TransferIntentParameters {
  recipient: RecipientCanonical;
  amount: number | 'all';
  asset: string; // e.g., 'usdc'
  fromWallet: string; // usually 'sera_vault'
}

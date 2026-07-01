import { isAddress } from 'viem';

export class OwnerIdentityService {
  private ownerAddress: string;

  constructor() {
    const address = process.env.OWNER_WALLET_ADDRESS;
    if (!address) {
      throw new Error('❌ [OwnerIdentityService] OWNER_WALLET_ADDRESS is not set in environment variables.');
    }
    if (!isAddress(address)) {
      throw new Error(`❌ [OwnerIdentityService] Invalid Ethereum address format: ${address}`);
    }
    this.ownerAddress = address;
  }

  public getOwnerAddress(): `0x${string}` {
    return this.ownerAddress as `0x${string}`;
  }
}

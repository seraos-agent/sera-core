import * as dotenv from 'dotenv';
dotenv.config();

import { SecretManager } from './src/core/secrets/SecretManager';
import { EncryptedDatabaseSecretStore } from './src/core/secrets/stores/EncryptedDatabaseSecretStore';
import { PolymarketService } from './src/capabilities/polymarket/PolymarketService';

async function test() {
  console.log('Testing PolymarketService...');
  
  const secretManager = new SecretManager(new EncryptedDatabaseSecretStore());
  const service = new PolymarketService(secretManager);

  console.log('Initializing...');
  await service.initialize();

  console.log('Searching markets...');
  const markets = await service.searchMarkets('election', 2);
  
  console.log('Results:');
  console.log(JSON.stringify(markets.map((m: any) => ({
    question: m.question,
    condition_id: m.condition_id,
    active: m.active
  })), null, 2));
}

test().catch(console.error);

import { ThreadsAPI } from './src/capabilities/threads/ThreadsAPI';
import { SecretManager } from './src/core/secrets/SecretManager';
import { EncryptedDatabaseSecretStore } from './src/core/secrets/stores/EncryptedDatabaseSecretStore';
import 'dotenv/config';

async function test() {
  const sm = new SecretManager(new EncryptedDatabaseSecretStore());
  const api = new ThreadsAPI(sm);
  
  try {
    const mentions = await api.getMentions(10);
    console.log("SUCCESS! Mentions found:", mentions.length);
    console.log(JSON.stringify(mentions, null, 2));
  } catch (err: any) {
    console.error("ERROR FETCHING MENTIONS:", err.message);
  }
}

test();

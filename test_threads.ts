import { SecretManager } from './src/core/secrets/SecretManager';
import { ThreadsAPI } from './src/capabilities/threads/ThreadsAPI';
import * as dotenv from 'dotenv';
dotenv.config();

const mockStore = {
  getSecret: async (key: string) => process.env[key] || null,
  setSecret: async (key: string, val: string) => {},
  deleteSecret: async (key: string) => {}
};

async function run() {
  const secrets = new SecretManager(mockStore);
  const api = new ThreadsAPI(secrets, fetch);
  
  console.log('--- Fetching User Threads ---');
  try {
    const threads = await api.getUserThreads(5);
    console.log(JSON.stringify(threads, null, 2));

    if (threads.length > 0) {
      console.log(`\n--- Fetching Replies for Thread ${threads[0].id} ---`);
      const replies = await api.getThreadReplies(threads[0].id, 10);
      console.log(JSON.stringify(replies, null, 2));
    }
  } catch (err: any) {
    console.error('Error fetching threads or replies:', err.message);
  }

  console.log('\n--- Fetching Mentions ---');
  try {
    const mentions = await api.getMentions(5);
    console.log(JSON.stringify(mentions, null, 2));
  } catch (err: any) {
    console.error('Error fetching mentions:', err.message);
  }
}

run();

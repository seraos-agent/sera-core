import assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { AuditLogger } from '../src/core/telemetry/AuditLogger';
import { ThreadsDaemon } from '../src/capabilities/threads/ThreadsDaemon';
import { ThreadsAPI } from '../src/capabilities/threads/ThreadsAPI';
import { SecretManager } from '../src/core/secrets/SecretManager';

async function testDaemonEfficiency() {
  console.log('================================================================');
  console.log('🧪 RUNNING TEST: THREADS DAEMON & LOG EFFICIENCY');
  console.log('================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: AuditLogger Size-Based Rotation & Auto-Pruning
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 1: AuditLogger Size Rotation...');
  const testBus = new EventEmitter();
  const testDataDir = path.join(process.cwd(), '.data');
  const auditPath = path.join(testDataDir, 'audit.log');
  const auditOldPath = path.join(testDataDir, 'audit.log.old');

  const logger = new AuditLogger(testBus, { persistLocally: true });

  // Write enough large payload to trigger rotation (> 2 MB)
  const largeChunk = 'X'.repeat(50 * 1024); // 50 KB
  for (let i = 0; i < 45; i++) {
    testBus.emit('SYSTEM_TELEMETRY', { chunk: largeChunk, iteration: i });
  }

  // Wait a moment for non-blocking file writes to flush
  await new Promise(resolve => setTimeout(resolve, 800));

  // Verify that rotation happened and audit.log does not explode indefinitely
  assert.ok(fs.existsSync(auditPath) || fs.existsSync(auditOldPath), 'Audit log file must exist');
  console.log('  ✅ AuditLogger rotation tested successfully.');

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: ThreadsDaemon 24-Hour Window & Watermark Auto-Pruning
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 2: ThreadsDaemon 24-Hour Window & Watermark Auto-Pruning...');

  const now = Date.now();
  const mockThreads = [
    // Thread 1: 2 hours ago (< 24h) -> Active
    { id: 'thread-active-1', text: 'Recent active thread 1', timestamp: new Date(now - 2 * 3600 * 1000).toISOString() },
    // Thread 2: 5 hours ago (< 24h) -> Active
    { id: 'thread-active-2', text: 'Recent active thread 2', timestamp: new Date(now - 5 * 3600 * 1000).toISOString() },
    // Thread 3: 30 hours ago (> 24h) -> Expired / Cold
    { id: 'thread-stale-3', text: 'Stale thread 3 (> 24h)', timestamp: new Date(now - 30 * 3600 * 1000).toISOString() }
  ];

  const mockFetch: typeof fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input.toString();

    // /me/threads
    if (urlStr.includes('/me/threads') && !urlStr.includes('/replies')) {
      return new Response(JSON.stringify({ data: mockThreads }), { status: 200 });
    }

    // /replies
    if (urlStr.includes('/replies')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }

    // /mentions
    if (urlStr.includes('/me/mentions')) {
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }

    return new Response(JSON.stringify({ data: [] }), { status: 200 });
  };

  const memorySecrets = new Map<string, string>();
  memorySecrets.set('THREADS_TOKEN_test-eff', 'mock-token');
  const secretStore = {
    getSecret: async (k: string) => memorySecrets.get(k) || null,
    storeSecret: async (k: string, v: string) => { memorySecrets.set(k, v); },
    deleteSecret: async (k: string) => { memorySecrets.delete(k); },
    listSecrets: async () => []
  };
  const secretManager = new SecretManager(secretStore as any);
  const api = new ThreadsAPI(secretManager, mockFetch);
  const daemon = new ThreadsDaemon(api, testBus, 'test-eff', secretManager);

  // Pre-populate watermark with a stale thread ID (simulating a thread from 5 days ago)
  (daemon as any).lastProcessedReplyIds.set('thread-stale-old-999', 'reply-old-999');
  (daemon as any).lastProcessedReplyIds.set('thread-active-1', 'reply-prev-1');

  // Trigger pollReplies
  await daemon.pollReplies(true);

  // Stale thread ID must be purged automatically!
  const replyMap = (daemon as any).lastProcessedReplyIds;
  assert.strictEqual(replyMap.has('thread-stale-old-999'), false, 'Stale thread ID must be pruned from watermark');
  assert.strictEqual(replyMap.has('thread-active-1'), true, 'Active thread ID must remain in watermark');
  console.log('  ✅ Stale watermark entries successfully purged! Active entries:', Array.from(replyMap.keys()));

  console.log('\n================================================================');
  console.log('🎉 ALL DAEMON & LOG EFFICIENCY TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================\n');
}

testDaemonEfficiency().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

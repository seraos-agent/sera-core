import assert from 'assert';
import { ThreadsAPI, sanitizeThreadsText } from '../src/capabilities/threads/ThreadsAPI';
import { ThreadsCapability } from '../src/capabilities/threads/ThreadsCapability';
import { SecretManager } from '../src/core/secrets/SecretManager';
import { EncryptedDatabaseSecretStore } from '../src/core/secrets/stores/EncryptedDatabaseSecretStore';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING TEST: ADVANCED THREADS (CAROUSEL, UTAS, INSIGHTS, SANITIZER)');
  console.log('================================================================\n');

  // Test 1: Sanitizer strictly targets long em dash (—) and preserves en dash (–)
  console.log('▶ Test 1: Threads Text Sanitizer...');
  const inputWithEmDash = 'AI is evolving — we must adapt. Range: 10–20% growth.';
  const sanitized = sanitizeThreadsText(inputWithEmDash);
  assert.strictEqual(sanitized, 'AI is evolving - we must adapt. Range: 10–20% growth.');
  assert.ok(!sanitized.includes('—'), 'Em dash must be removed');
  assert.ok(sanitized.includes('–'), 'En dash must be preserved');
  console.log('  ✅ Sanitizer passed:', sanitized);

  // Mock Fetch for Meta Threads Graph API
  const publishedPosts: any[] = [];
  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    console.log('  [mockFetch]', init?.method || 'GET', urlStr);
    const urlObj = new URL(urlStr);

    // 1. Create container
    if (urlStr.includes('/me/threads') && init?.method === 'POST') {
      const mediaType = urlObj.searchParams.get('media_type') || 'TEXT';
      const text = urlObj.searchParams.get('text') || '';
      const isCarouselItem = urlObj.searchParams.get('is_carousel_item') === 'true';
      const children = urlObj.searchParams.get('children');
      const replyToId = urlObj.searchParams.get('reply_to_id');
      const id = `container-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      return new Response(JSON.stringify({ id }), { status: 200 });
    }

    // 2. Publish container
    if (urlStr.includes('/me/threads_publish') && init?.method === 'POST') {
      const creationId = urlObj.searchParams.get('creation_id');
      const postId = `threads-post-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      publishedPosts.push({ id: postId, creationId });
      return new Response(JSON.stringify({ id: postId }), { status: 200 });
    }

    // 3. User threads (recent posts)
    if (urlStr.includes('/me/threads') && !urlStr.includes('/me/threads_insights') && (!init || init.method === 'GET')) {
      return new Response(JSON.stringify({
        data: [
          { id: 'post-1', text: 'Recent post 1', timestamp: '2026-09-07T08:00:00Z', permalink: 'https://threads.net/@user/post/1', media_type: 'TEXT_POST' },
          { id: 'post-2', text: 'Recent post 2', timestamp: '2026-09-07T07:00:00Z', permalink: 'https://threads.net/@user/post/2', media_type: 'CAROUSEL_POST' }
        ]
      }), { status: 200 });
    }

    // 4. Post insights
    if (urlStr.includes('/insights') && !urlStr.includes('/me/threads_insights')) {
      return new Response(JSON.stringify({
        data: [
          { name: 'views', total_value: { value: 1250 } },
          { name: 'likes', total_value: { value: 95 } },
          { name: 'replies', total_value: { value: 14 } },
          { name: 'reposts', total_value: { value: 8 } },
          { name: 'quotes', total_value: { value: 3 } }
        ]
      }), { status: 200 });
    }

    // 5. Account-level insights
    if (urlStr.includes('/me/threads_insights')) {
      return new Response(JSON.stringify({
        data: [
          { name: 'views', total_value: { value: 45000 } },
          { name: 'likes', total_value: { value: 3200 } },
          { name: 'replies', total_value: { value: 410 } },
          { name: 'reposts', total_value: { value: 190 } },
          { name: 'quotes', total_value: { value: 75 } },
          { name: 'follower_count', total_value: { value: 850 } }
        ]
      }), { status: 200 });
    }

    return new Response('Not Found', { status: 404 });
  };

  // Setup Mock SecretManager with a valid token
  const memorySecrets = new Map<string, string>();
  memorySecrets.set('THREADS_TOKEN_test-session', 'mock-threads-access-token');
  const mockSecretStore = {
    getSecret: async (key: string) => memorySecrets.get(key) || null,
    storeSecret: async (key: string, val: string) => { memorySecrets.set(key, val); },
    deleteSecret: async (key: string) => { memorySecrets.delete(key); },
    listSecrets: async () => Array.from(memorySecrets.keys())
  };
  const secretManager = new SecretManager(mockSecretStore as any);

  const api = new ThreadsAPI(secretManager, mockFetch);
  const capability = new ThreadsCapability(api, secretManager);

  // Test 2: Publish Carousel
  console.log('\n▶ Test 2: Publish Carousel (3 images)...');
  const carouselResult = await capability.execute('THREADS_PUBLISH', {
    text: 'Check out our 3-slide carousel — exciting updates! (Range: 10–20%)',
    imageUrls: ['https://cdn.example.com/slide1.jpg', 'https://cdn.example.com/slide2.jpg', 'https://cdn.example.com/slide3.jpg']
  }, 'test-session');

  assert.strictEqual(carouselResult.success, true);
  assert.ok(carouselResult.postId);
  console.log('  ✅ Carousel published successfully:', carouselResult);

  // Test 3: Publish Chained Thread (Utas 3-parts)
  console.log('\n▶ Test 3: Publish Chained Thread (Utas)...');
  const utasResult = await capability.execute('THREADS_PUBLISH', {
    text: 'Part 1: The foundational principle — AI Agency.',
    threadChain: [
      'Part 2: Multi-step reasoning and autonomy.',
      'Part 3: Final conclusions and insights.'
    ]
  }, 'test-session');

  assert.strictEqual(utasResult.success, true);
  assert.strictEqual(utasResult.totalParts, 3);
  assert.strictEqual(utasResult.chainedIds.length, 3);
  console.log('  ✅ Chained thread published successfully:', utasResult);

  // Test 4: Get Recent Posts
  console.log('\n▶ Test 4: Retrieve Recent Threads Posts...');
  const postsResult = await capability.execute('THREADS_GET_POSTS', { limit: 5 }, 'test-session');
  assert.strictEqual(postsResult.success, true);
  assert.strictEqual(postsResult.count, 2);
  assert.strictEqual(postsResult.posts[0].id, 'post-1');
  console.log('  ✅ Recent posts retrieved successfully:', postsResult);

  // Test 5: Post Insights
  console.log('\n▶ Test 5: Retrieve Post-Specific Insights...');
  const postInsightsResult = await capability.execute('THREADS_GET_INSIGHTS', { postId: 'post-1' }, 'test-session');
  assert.strictEqual(postInsightsResult.success, true);
  assert.strictEqual(postInsightsResult.insights.views, 1250);
  assert.strictEqual(postInsightsResult.insights.likes, 95);
  console.log('  ✅ Post insights retrieved successfully:', postInsightsResult);

  // Test 6: Account-Level Insights
  console.log('\n▶ Test 6: Retrieve Account-Level Insights...');
  const accountInsightsResult = await capability.execute('THREADS_GET_INSIGHTS', {}, 'test-session');
  assert.strictEqual(accountInsightsResult.success, true);
  assert.strictEqual(accountInsightsResult.insights.views, 45000);
  assert.strictEqual(accountInsightsResult.insights.likes, 3200);
  console.log('  ✅ Account insights retrieved successfully:', accountInsightsResult);

  console.log('\n================================================================');
  console.log('🎉 ALL ADVANCED THREADS TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});

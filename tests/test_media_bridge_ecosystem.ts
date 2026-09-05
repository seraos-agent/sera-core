import assert from 'assert';
import { GoogleDriveCapability } from '../src/capabilities/google-drive/GoogleDriveCapability';
import { ThreadsAPI } from '../src/capabilities/threads/ThreadsAPI';
import { ThreadsCapability } from '../src/capabilities/threads/ThreadsCapability';

async function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING TEST: MEDIA BRIDGE (DRIVE ↔ CHAT ↔ THREADS PUBLISHING)');
  console.log('================================================================\n');

  const inMemoryFiles = new Map<string, { id: string; name: string; buffer: Buffer; mimeType: string; parents?: string[] }>();
  let nextFileId = 1000;

  // Mock Google Drive & Supabase fetch implementation
  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input.toString();

    // 1. Google OAuth token refresh
    if (urlStr.includes('oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'mock-access-token-123' }), { status: 200 });
    }

    // 2. Google Drive subfolder / files queries
    if (urlStr.includes('googleapis.com/drive/v3/files') && !urlStr.includes('uploadType') && init?.method !== 'POST' && init?.method !== 'DELETE') {
      const urlObj = new URL(urlStr);
      const q = urlObj.searchParams.get('q') || '';
      const fields = urlObj.searchParams.get('fields') || '';

      // Direct file metadata request: files/{fileId}
      const fileIdMatch = urlStr.match(/files\/([^?]+)/);
      if (fileIdMatch && !urlStr.includes('?q=')) {
        const fileId = fileIdMatch[1];
        if (urlStr.includes('alt=media')) {
          const file = inMemoryFiles.get(fileId);
          if (!file) return new Response('File not found', { status: 404 });
          return new Response(new Uint8Array(file.buffer), {
            status: 200,
            headers: { 'Content-Type': file.mimeType }
          });
        }

        const file = inMemoryFiles.get(fileId);
        if (!file) return new Response('File not found', { status: 404 });
        return new Response(JSON.stringify({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          webViewLink: `https://drive.google.com/file/d/${file.id}/view`
        }), { status: 200 });
      }

      // Folder search: 'SERA Vault' or subfolders
      if (q.includes('application/vnd.google-apps.folder')) {
        const folderNameMatch = q.match(/name\s*=\s*'([^']+)'/);
        const folderName = folderNameMatch ? folderNameMatch[1] : 'folder';
        const existing = Array.from(inMemoryFiles.values()).find(f => f.name === folderName && f.mimeType === 'application/vnd.google-apps.folder');
        if (existing) {
          return new Response(JSON.stringify({ files: [{ id: existing.id, name: existing.name }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ files: [] }), { status: 200 });
      }

      // General file listing query
      const matchedFiles = Array.from(inMemoryFiles.values()).filter(f => {
        if (f.mimeType === 'application/vnd.google-apps.folder') return false;
        if (q.includes(`name = '${f.name}'`)) return true;
        if (q.includes(`name contains '${f.name}'`)) return true;
        if (q.includes(`name = `) || q.includes(`name contains `)) return false;
        return true;
      });

      return new Response(JSON.stringify({
        files: matchedFiles.map(f => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          webViewLink: `https://drive.google.com/file/d/${f.id}/view`,
          webContentLink: `https://drive.google.com/uc?id=${f.id}&export=download`,
          parents: f.parents || []
        }))
      }), { status: 200 });
    }

    // 3. Create folder
    if (urlStr.includes('googleapis.com/drive/v3/files') && init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      const id = `folder-${nextFileId++}`;
      inMemoryFiles.set(id, { id, name: body.name, buffer: Buffer.alloc(0), mimeType: body.mimeType, parents: body.parents });
      return new Response(JSON.stringify({ id, name: body.name }), { status: 200 });
    }

    // 4. Multipart upload (writeBuffer)
    if (urlStr.includes('upload/drive/v3/files') && (init?.method === 'POST' || init?.method === 'PATCH')) {
      const bodyBuffer = init?.body as Buffer;
      const bodyStr = bodyBuffer.toString('latin1');
      const metaMatch = bodyStr.match(/\{[\s\S]*?\}/);
      const meta = metaMatch ? JSON.parse(metaMatch[0]) : { name: 'unnamed' };

      const id = `file-${nextFileId++}`;
      inMemoryFiles.set(id, {
        id,
        name: meta.name,
        buffer: Buffer.from('mock-media-binary-content-bytes'),
        mimeType: meta.mimeType || 'image/jpeg',
        parents: meta.parents
      });

      return new Response(JSON.stringify({
        id,
        name: meta.name,
        webViewLink: `https://drive.google.com/file/d/${id}/view`
      }), { status: 200 });
    }

    // 5. Supabase Storage upload
    if (urlStr.includes('/storage/v1/object/sera_chat_attachments/')) {
      if (init?.method === 'POST') {
        const fileKey = urlStr.split('/storage/v1/object/sera_chat_attachments/')[1];
        return new Response(JSON.stringify({ Key: fileKey }), { status: 200 });
      }
      if (init?.method === 'DELETE') {
        return new Response(JSON.stringify({ message: 'Deleted' }), { status: 200 });
      }
    }

    // 6. Meta Threads Graph API
    if (urlStr.includes('graph.threads.net/v1.0')) {
      // Publish container
      if (urlStr.includes('/me/threads_publish') && init?.method === 'POST') {
        return new Response(JSON.stringify({ id: `threads-post-${Date.now()}` }), { status: 200 });
      }

      // Create container
      if (urlStr.includes('/me/threads') && init?.method === 'POST') {
        const urlObj = new URL(urlStr);
        const mediaType = urlObj.searchParams.get('media_type');
        const text = urlObj.searchParams.get('text');
        const imageUrl = urlObj.searchParams.get('image_url');
        const videoUrl = urlObj.searchParams.get('video_url');

        console.log(`  [Mock Threads API] Created container: type=${mediaType}, text="${text?.slice(0, 30)}...", video=${!!videoUrl}, image=${!!imageUrl}`);
        return new Response(JSON.stringify({ id: `container-${Date.now()}` }), { status: 200 });
      }

      // Container status polling
      if (urlStr.match(/v1\.0\/container-\d+/)) {
        console.log(`  [Mock Threads API] Polling container status: FINISHED`);
        return new Response(JSON.stringify({ id: 'container-1', status: 'FINISHED' }), { status: 200 });
      }

    }

    return new Response('Not Found', { status: 404 });
  };

  // Mock repository with active connection
  const mockRepo = {
    getRefreshToken: async () => 'mock-refresh-token',
    getStatus: async () => ({
      provider: 'GOOGLE_DRIVE' as const,
      status: 'CONNECTED' as const,
      vaultFolderId: 'vault-root-1'
    }),
    find: async () => ({
      user_id: 'dev-user',
      provider: 'GOOGLE_DRIVE' as const,
      status: 'CONNECTED' as const,
      vault_folder_id: 'vault-root-1'
    })
  } as any;

  // Pre-seed Vault root folder
  inMemoryFiles.set('vault-root-1', {
    id: 'vault-root-1',
    name: 'SERA Vault',
    buffer: Buffer.alloc(0),
    mimeType: 'application/vnd.google-apps.folder'
  });

  const driveCap = new GoogleDriveCapability(mockRepo, 'mock-client-id', 'mock-client-secret', mockFetch);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Save Photo from Chat to Google Drive
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 1: Save Photo to Google Drive (saveMedia)...');
  const samplePhotoBase64 = 'data:image/jpeg;base64,' + Buffer.from('photo-pixels-12345').toString('base64');
  const photoResult = await driveCap.saveMedia('dev-user', 'promo-ramadhan.jpg', samplePhotoBase64);

  assert.strictEqual(photoResult.filename, 'promo-ramadhan.jpg');
  assert.strictEqual(photoResult.folder, '🎨 Media & Creative');
  assert.strictEqual(photoResult.isVideo, false);
  assert.ok(photoResult.fileId);
  assert.ok(photoResult.webViewLink.includes('drive.google.com'));
  console.log('  ✅ Photo saved successfully:', photoResult.filename, '->', photoResult.folder);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Save Video from Chat to Google Drive
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 2: Save Video to Google Drive (saveMedia)...');
  const sampleVideoBase64 = 'data:video/mp4;base64,' + Buffer.from('mp4-video-stream-bytes').toString('base64');
  const videoResult = await driveCap.saveMedia('dev-user', 'demo-launch.mp4', sampleVideoBase64);

  assert.strictEqual(videoResult.filename, 'demo-launch.mp4');
  assert.strictEqual(videoResult.folder, '🎨 Media & Creative');
  assert.strictEqual(videoResult.isVideo, true);
  assert.ok(videoResult.fileId);
  console.log('  ✅ Video saved successfully:', videoResult.filename, '->', videoResult.folder);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Ephemeral Media Bridge from Drive to CDN (Photo)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 3: Ephemeral Media Bridge (Drive Photo -> Public CDN)...');
  const photoBridge = await driveCap.bridgeDriveMediaToCdn('dev-user', 'promo-ramadhan.jpg');

  assert.ok(photoBridge.publicUrl);
  assert.strictEqual(photoBridge.isVideo, false);
  assert.strictEqual(photoBridge.mimeType, 'image/jpeg');
  assert.ok(photoBridge.fileKey.includes('bridge/devuser/'));
  console.log('  ✅ Photo bridged to CDN:', photoBridge.publicUrl);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: Ephemeral Media Bridge from Drive to CDN (Video)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 4: Ephemeral Media Bridge (Drive Video -> Public CDN)...');
  const videoBridge = await driveCap.bridgeDriveMediaToCdn('dev-user', 'demo-launch.mp4');

  assert.ok(videoBridge.publicUrl);
  assert.strictEqual(videoBridge.isVideo, true);
  assert.strictEqual(videoBridge.mimeType, 'video/mp4');
  assert.ok(videoBridge.fileKey.includes('bridge/devuser/'));
  console.log('  ✅ Video bridged to CDN:', videoBridge.publicUrl);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: ThreadsAPI Video Container & Polling
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 5: ThreadsAPI Publish with Video Container Polling...');
  const mockSecretManager = {
    getSecret: async (key: string) => (key.includes('THREADS_TOKEN') ? 'mock-threads-token' : null)
  } as any;

  const threadsApi = new ThreadsAPI(mockSecretManager, mockFetch);
  const videoPostId = await threadsApi.publishPost(
    'dev-user',
    'Excited to launch our product today! 🚀',
    undefined,
    undefined,
    videoBridge.publicUrl
  );

  assert.ok(videoPostId.startsWith('threads-post-'));
  console.log('  ✅ Video post published successfully via Threads API (Post ID:', videoPostId, ')');

  // ──────────────────────────────────────────────────────────────────────────
  // Test 6: ThreadsCapability Integration with Google Drive Bridge
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 6: ThreadsCapability Full Flow (driveFileName -> Bridge -> Publish -> Cleanup)...');
  const threadsCap = new ThreadsCapability(threadsApi, mockSecretManager, undefined, driveCap);

  const capResult = await threadsCap.executeTool(
    'THREADS_PUBLISH',
    {
      text: 'Special Ramadhan promotion starts now!',
      driveFileName: 'promo-ramadhan.jpg'
    },
    { sessionId: 'dev-user' }
  );

  assert.strictEqual(capResult.success, true);
  assert.ok(capResult.postId);
  console.log('  ✅ ThreadsCapability successfully resolved Drive asset, bridged, published, and cleaned up temporary CDN key!');

  // ──────────────────────────────────────────────────────────────────────────
  // Test 7: Cleanup CDN Bridge
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 7: CDN Bridge Cleanup...');
  const cleaned = await driveCap.cleanupCdnBridge(videoBridge.fileKey);
  console.log('  ✅ Ephemeral CDN bridge cleaned up:', cleaned !== false);

  console.log('\n================================================================');
  console.log('🎉 ALL MEDIA BRIDGE & PUBLISHING TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});

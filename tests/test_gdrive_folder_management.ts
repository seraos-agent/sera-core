import assert from 'node:assert';
import { GoogleDriveCapability } from '../src/capabilities/google-drive/GoogleDriveCapability';
import { ProductivitySubAgent } from '../src/capabilities/agents/ProductivitySubAgent';

interface MockFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
  buffer?: Buffer;
}

async function runTests() {
  console.log('================================================================');
  console.log('🧪 TESTING GOOGLE DRIVE FOLDER MANAGEMENT & VAULT AUTO-TIDY');
  console.log('================================================================\n');

  // In-memory mock file system for Google Drive
  const filesMap = new Map<string, MockFile>();
  let nextFileId = 2000;

  // Pre-seed Vault root folder
  const vaultRootId = 'vault-root-folder';
  filesMap.set(vaultRootId, {
    id: vaultRootId,
    name: 'SERA Vault',
    mimeType: 'application/vnd.google-apps.folder',
    parents: ['root'],
    trashed: false,
    webViewLink: 'https://drive.google.com/drive/folders/vault-root-folder'
  });

  const mockRepo = {
    getStatus: async () => ({ status: 'CONNECTED', vaultFolderId: vaultRootId }),
    getRefreshToken: async () => 'mock-refresh-token'
  } as any;

  const mockFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlStr = typeof input === 'string' ? input : input.toString();
    const parsed = new URL(urlStr);
    const method = (init?.method || 'GET').toUpperCase();

    // 1. Token exchange
    if (urlStr.includes('oauth2.googleapis.com/token')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'mock-access-token', expires_in: 3600 })
      } as any;
    }

    // 2. Query / List files (GET /files)
    if (parsed.pathname === '/drive/v3/files' && method === 'GET') {
      const q = parsed.searchParams.get('q') || '';
      let results = Array.from(filesMap.values()).filter(f => !f.trashed);

      // Parent filter
      const parentMatch = q.match(/'([^']+)' in parents/);
      if (parentMatch) {
        const parentId = parentMatch[1];
        results = results.filter(f => (f.parents || []).includes(parentId));
      }

      // MIME type filter
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
        results = results.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
      } else if (q.includes("mimeType != 'application/vnd.google-apps.folder'")) {
        results = results.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
      }

      // Name filter
      const nameExact = q.match(/name = '([^']+)'/);
      if (nameExact) {
        results = results.filter(f => f.name === nameExact[1]);
      }
      const nameContains = q.match(/name contains '([^']+)'/);
      if (nameContains) {
        results = results.filter(f => f.name.includes(nameContains[1]));
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ files: results })
      } as any;
    }

    // 3. Create folder or file (POST /files)
    if (parsed.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(init?.body as string || '{}');
      const id = `file-${nextFileId++}`;
      const newFile: MockFile = {
        id,
        name: body.name || 'Untitled',
        mimeType: body.mimeType || 'application/octet-stream',
        parents: body.parents || [vaultRootId],
        trashed: false,
        webViewLink: body.mimeType === 'application/vnd.google-apps.folder'
          ? `https://drive.google.com/drive/folders/${id}`
          : `https://drive.google.com/file/d/${id}/view`
      };
      filesMap.set(id, newFile);
      return {
        ok: true,
        status: 200,
        json: async () => newFile
      } as any;
    }

    // 4. Inspect file by ID (GET /files/{id})
    const getMatch = parsed.pathname.match(/\/drive\/v3\/files\/([^/?]+)$/);
    if (getMatch && method === 'GET') {
      const fileId = getMatch[1];
      const found = filesMap.get(fileId);
      if (found) {
        return {
          ok: true,
          status: 200,
          json: async () => found
        } as any;
      }
      return { ok: false, status: 404, text: async () => 'File not found' } as any;
    }

    // 5. Update / Move / Rename / Trash (PATCH /files/{id})
    const patchMatch = parsed.pathname.match(/\/drive\/v3\/files\/([^/?]+)$/);
    if (patchMatch && method === 'PATCH') {
      const fileId = patchMatch[1];
      const target = filesMap.get(fileId);
      if (!target) {
        return { ok: false, status: 404, text: async () => 'File not found' } as any;
      }

      // Handle addParents & removeParents query params
      const addParents = parsed.searchParams.get('addParents');
      const removeParents = parsed.searchParams.get('removeParents');
      if (addParents) {
        const current = target.parents || [];
        const toRemove = (removeParents || '').split(',').map(s => s.trim()).filter(Boolean);
        target.parents = current.filter(p => !toRemove.includes(p));
        target.parents.push(addParents);
      }

      // Handle body modifications (name, trashed)
      if (init?.body) {
        const body = JSON.parse(init.body as string);
        if (body.name) target.name = body.name;
        if (typeof body.trashed === 'boolean') target.trashed = body.trashed;
      }

      return {
        ok: true,
        status: 200,
        json: async () => target
      } as any;
    }

    // 6. Delete file/folder (DELETE /files/{id})
    if (patchMatch && method === 'DELETE') {
      const fileId = patchMatch[1];
      filesMap.delete(fileId);
      return { ok: true, status: 204 } as any;
    }

    return { ok: false, status: 404, text: async () => 'Endpoint not found' } as any;
  };

  const gdrive = new GoogleDriveCapability(mockRepo, 'client-id', 'client-secret', mockFetch);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 1: Create Custom Folder in SERA Vault
  // ──────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 1: Create Custom Folder in SERA Vault (createFolder)...');
  const folder1 = await gdrive.createFolder('dev-user', 'Katalog Promo 2026');
  assert.strictEqual(folder1.folderName, 'Katalog Promo 2026');
  assert.ok(folder1.folderId);
  assert.ok(folder1.webViewLink.includes('drive.google.com'));
  const storedFolder = filesMap.get(folder1.folderId);
  assert.ok(storedFolder);
  assert.strictEqual(storedFolder.name, 'Katalog Promo 2026');
  assert.deepStrictEqual(storedFolder.parents, [vaultRootId]);
  console.log('  ✅ Root folder created successfully:', folder1.folderName, `(ID: ${folder1.folderId})`);

  // Test 1b: Create nested folder inside "Katalog Promo 2026"
  console.log('\n▶ Test 1b: Create Nested Folder (parentFolderName)...');
  const nestedFolder = await gdrive.createFolder('dev-user', 'Desain Kaos', 'Katalog Promo 2026');
  assert.strictEqual(nestedFolder.folderName, 'Desain Kaos');
  const storedNested = filesMap.get(nestedFolder.folderId);
  assert.ok(storedNested);
  assert.deepStrictEqual(storedNested.parents, [folder1.folderId]);
  console.log('  ✅ Nested folder created inside parent:', nestedFolder.folderName, '->', folder1.folderName);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 2: Rename Folder and File
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 2: Rename Folder and File (renameItem)...');
  const renameFolderResult = await gdrive.renameItem('dev-user', 'Katalog Promo 2026', 'Katalog Ramadhan 2026');
  assert.strictEqual(renameFolderResult.oldName, 'Katalog Promo 2026');
  assert.strictEqual(renameFolderResult.newName, 'Katalog Ramadhan 2026');
  assert.strictEqual(renameFolderResult.isFolder, true);
  assert.strictEqual(filesMap.get(folder1.folderId)!.name, 'Katalog Ramadhan 2026');
  console.log('  ✅ Folder renamed successfully:', renameFolderResult.oldName, '->', renameFolderResult.newName);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 3: Move File to Folder (moveItem)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 3: Move File between Folders (moveItem)...');
  // Create a file in root
  const sampleFileId = `file-${nextFileId++}`;
  filesMap.set(sampleFileId, {
    id: sampleFileId,
    name: 'brosur-ramadhan.png',
    mimeType: 'image/png',
    parents: [vaultRootId],
    trashed: false
  });

  const moveResult = await gdrive.moveItem('dev-user', 'brosur-ramadhan.png', 'Katalog Ramadhan 2026');
  assert.strictEqual(moveResult.name, 'brosur-ramadhan.png');
  assert.strictEqual(moveResult.destinationFolder, 'Katalog Ramadhan 2026');
  const movedFile = filesMap.get(sampleFileId)!;
  assert.deepStrictEqual(movedFile.parents, [folder1.folderId]);
  console.log('  ✅ File moved successfully:', moveResult.name, '->', moveResult.destinationFolder);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 4: Delete Folder (deleteFolder)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 4: Delete / Trash Folder (deleteFolder)...');
  const deleteResult = await gdrive.deleteFolder('dev-user', 'Desain Kaos');
  assert.strictEqual(deleteResult.name, 'Desain Kaos');
  assert.strictEqual(deleteResult.trashed, true);
  const deletedFolder = filesMap.get(nestedFolder.folderId)!;
  assert.strictEqual(deletedFolder.trashed, true);
  console.log('  ✅ Folder moved to Trash successfully:', deleteResult.name);

  // ──────────────────────────────────────────────────────────────────────────
  // Test 5: Vault Auto-Tidy (tidyVault)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 5: Vault Auto-Tidy (tidyVault)...');
  // Seed 3 unorganized files at the root of SERA Vault
  const scatteredFiles = [
    { id: `file-${nextFileId++}`, name: 'unorganized-video.mp4', mimeType: 'video/mp4', parents: [vaultRootId], trashed: false },
    { id: `file-${nextFileId++}`, name: 'unorganized-sales.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', parents: [vaultRootId], trashed: false },
    { id: `file-${nextFileId++}`, name: 'unorganized-brief.md', mimeType: 'text/markdown', parents: [vaultRootId], trashed: false }
  ];
  for (const sf of scatteredFiles) filesMap.set(sf.id, sf);

  const tidyResult = await gdrive.tidyVault('dev-user');
  assert.strictEqual(tidyResult.movedCount, 3);
  console.log(`  ✅ tidyVault organized ${tidyResult.movedCount} files:`);
  for (const item of tidyResult.items) {
    console.log(`     • ${item.name} ➔ ${item.destinationFolder}`);
  }

  // Verify each file was assigned to the correct category
  const movedVideo = filesMap.get(scatteredFiles[0].id)!;
  const movedSheet = filesMap.get(scatteredFiles[1].id)!;
  const movedDoc = filesMap.get(scatteredFiles[2].id)!;

  // Retrieve destination folder names
  const mediaFolder = Array.from(filesMap.values()).find(f => f.name === '🎨 Media & Creative')!;
  const sheetFolder = Array.from(filesMap.values()).find(f => f.name === '📊 Spreadsheets & Analysis')!;
  const docFolder = Array.from(filesMap.values()).find(f => f.name === '📑 Reports & Research')!;

  assert.deepStrictEqual(movedVideo.parents, [mediaFolder.id]);
  assert.deepStrictEqual(movedSheet.parents, [sheetFolder.id]);
  assert.deepStrictEqual(movedDoc.parents, [docFolder.id]);
  console.log('  ✅ Verified: All files correctly routed into canonical ecosystem folders!');

  // ──────────────────────────────────────────────────────────────────────────
  // Test 6: ProductivitySubAgent Tool Manifest
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n▶ Test 6: ProductivitySubAgent Tool Manifest Validation...');
  const agent = new ProductivitySubAgent();
  const toolNames = agent.getTools().map(t => t.name);
  assert.ok(toolNames.includes('GDRIVE_CREATE_FOLDER'), 'Missing GDRIVE_CREATE_FOLDER');
  assert.ok(toolNames.includes('GDRIVE_RENAME'), 'Missing GDRIVE_RENAME');
  assert.ok(toolNames.includes('GDRIVE_MOVE'), 'Missing GDRIVE_MOVE');
  assert.ok(toolNames.includes('GDRIVE_DELETE_FOLDER'), 'Missing GDRIVE_DELETE_FOLDER');
  assert.ok(toolNames.includes('GDRIVE_TIDY_VAULT'), 'Missing GDRIVE_TIDY_VAULT');
  console.log('  ✅ All 5 folder management tools registered in ProductivitySubAgent:', toolNames.filter(n => n.startsWith('GDRIVE_')));

  console.log('\n================================================================');
  console.log('🎉 ALL FOLDER MANAGEMENT & TIDY TESTS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test failed with error:', err);
  process.exit(1);
});

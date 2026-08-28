const https = require('https');

function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function run() {
  const testWallet = '0xec15A9e25E1bEc21d960920F99eC46a29d6Afe11'.toLowerCase();
  console.log(`\n=== 1. Generating Link Code for: ${testWallet} ===`);

  const genRes = await request('https://mcp.seraos.xyz/api/mcp/generate-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ userId: testWallet }));

  console.log('Generate Response:', genRes.body);
  const { code: linkCode } = JSON.parse(genRes.body);
  console.log('Generated Link Code:', linkCode);

  console.log(`\n=== 2. Authorizing with Link Code in OAuth Decision ===`);
  const formBody = new URLSearchParams({
    client_id: 'claude-ai-mcp',
    redirect_uri: 'https://claude.ai/oauth/callback',
    state: 'xyz123',
    linkCode: linkCode,
    decision: 'approve'
  }).toString();

  const authRes = await request('https://mcp.seraos.xyz/oauth/authorize/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, formBody);

  console.log('Authorize Decision Status:', authRes.status);
  const location = authRes.headers.location;
  console.log('Redirect Location:', location);

  const callbackUrl = new URL(location, 'https://claude.ai');
  const authCode = callbackUrl.searchParams.get('code');
  console.log('Issued Authorization Code:', authCode);

  console.log(`\n=== 3. Exchanging Code for Stateless Access Token ===`);
  const tokenRes = await request('https://mcp.seraos.xyz/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    client_id: 'claude-ai-mcp',
    redirect_uri: 'https://claude.ai/oauth/callback'
  }).toString());

  console.log('Token Response:', tokenRes.body);
  const { access_token } = JSON.parse(tokenRes.body);
  console.log('Stateless Access Token:', access_token.slice(0, 35) + '...');

  console.log(`\n=== 4. Testing Tool Call with Bound Access Token ===`);
  const sseReq = https.request({
    hostname: 'mcp.seraos.xyz',
    path: '/sse',
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Authorization': `Bearer ${access_token}`
    }
  }, (res) => {
    let endpoint = '';
    res.on('data', async (chunk) => {
      const text = chunk.toString();
      console.log('[SSE EVENT]', text.trim());
      const match = text.match(/endpoint: (.*)/);
      if (match && !endpoint) {
        endpoint = match[1].trim();
        console.log('Got SSE Message Endpoint:', endpoint);

        // Send tools/call for sera_wallet_balance
        const callRes = await request(`https://mcp.seraos.xyz${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${access_token}`
          }
        }, JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'sera_wallet_balance',
            arguments: {}
          }
        }));

        console.log('Tool Call HTTP Status:', callRes.status);
      }

      if (text.includes('jsonrpc') && text.includes('result')) {
        console.log('\n=== TOOL RESULT RECEIVED ===\n', text);
        process.exit(0);
      }
    });
  });

  sseReq.end();
}

run().catch(console.error);

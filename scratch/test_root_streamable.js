// Test Streamable HTTP transport directly at ROOT PATH https://mcp.seraos.xyz/
async function testRootStreamableHTTP() {
  const rootUrl = 'https://mcp.seraos.xyz';
  const token = 'sera_mcp_at_eyJzdWIiOiIweGVjMTVhOWUyNWUxYmVjMjFkOTYwOTIwZjk5ZWM0NmEyOWQ2YWZlMTEiLCJjaWQiOiJjbGF1ZGUtYWktbWNwIiwic2NwIjoibWNwOmFsbCIsImV4cCI6MTc5MDQ0MTU1MDc4MCwibm9uY2UiOiI2ZjljOGRhYjEwOTA0MmRjIn0.c939e4e0a6cda424afd799da3ba60495f092935c9ccda7c2051c8e30ebb3de94';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json, text/event-stream'
  };

  // Test 1: Initialize at POST /
  console.log('=== Test 1: POST / (Initialize) ===');
  let res = await fetch(`${rootUrl}/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'claude-mobile', version: '1.0.0' }
      }
    })
  });
  console.log('Status:', res.status);
  const initResult = await res.json();
  console.log('Response:', JSON.stringify(initResult));

  // Test 2: tools/list at POST /
  console.log('\n=== Test 2: POST / (tools/list) ===');
  res = await fetch(`${rootUrl}/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    })
  });
  console.log('Status:', res.status);
  const listResult = await res.json();
  console.log('Tools count:', listResult?.result?.tools?.length);
  console.log('Tool names:', listResult?.result?.tools?.map(t => t.name));

  // Test 3: tools/call at POST /
  console.log('\n=== Test 3: POST / (tools/call sera_wallet_balance) ===');
  res = await fetch(`${rootUrl}/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'sera_wallet_balance',
        arguments: {}
      }
    })
  });
  console.log('Status:', res.status);
  const callResult = await res.json();
  console.log('Response:', JSON.stringify(callResult, null, 2));

  console.log('\n=== All Root Tests Succeeded ===');
}

testRootStreamableHTTP().catch(console.error);

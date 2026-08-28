// Test Streamable HTTP transport on production
async function testStreamableHTTP() {
  const baseUrl = 'https://mcp.seraos.xyz';
  const token = 'sera_mcp_at_eyJzdWIiOiIweGVjMTVhOWUyNWUxYmVjMjFkOTYwOTIwZjk5ZWM0NmEyOWQ2YWZlMTEiLCJjaWQiOiJjbGF1ZGUtYWktbWNwIiwic2NwIjoibWNwOmFsbCIsImV4cCI6MTc5MDQ0MTU1MDc4MCwibm9uY2UiOiI2ZjljOGRhYjEwOTA0MmRjIn0.c939e4e0a6cda424afd799da3ba60495f092935c9ccda7c2051c8e30ebb3de94';

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json, text/event-stream'
  };

  // Test 1: Initialize
  console.log('=== Test 1: Initialize ===');
  let res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    })
  });
  console.log('Status:', res.status);
  const initResult = await res.text();
  console.log('Response:', initResult);
  
  // Test 2: tools/list
  console.log('\n=== Test 2: tools/list ===');
  res = await fetch(`${baseUrl}/mcp`, {
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
  console.log('Tools count:', listResult?.result?.tools?.length ?? 'N/A');
  console.log('Tool names:', listResult?.result?.tools?.map(t => t.name) ?? 'N/A');

  // Test 3: tools/call (sera_wallet_balance)
  console.log('\n=== Test 3: tools/call sera_wallet_balance ===');
  res = await fetch(`${baseUrl}/mcp`, {
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
  const callResult = await res.text();
  console.log('Response:', callResult);

  console.log('\n=== All tests complete ===');
}

testStreamableHTTP().catch(console.error);

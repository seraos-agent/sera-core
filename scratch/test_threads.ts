import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

async function testThreadsPublish() {
  const token = "sera_mcp_at_eyJzdWIiOiIweGVjMTVhOWUyNWUxYmVjMjFkOTYwOTIwZjk5ZWM0NmEyOWQ2YWZlMTEiLCJjaWQiOiJjbGF1ZGUtYWktbWNwIiwic2NwIjoibWNwOmFsbCIsImV4cCI6MTc5MDQ0MTU1MDc4MCwibm9uY2UiOiI2ZjljOGRhYjEwOTA0MmRjIn0.c939e4e0a6cda424afd799da3ba60495f092935c9ccda7c2051c8e30ebb3de94";
  
  const transport = new SSEClientTransport(
    new URL('https://mcp.seraos.xyz/sse'),
    {
      eventSourceInit: { headers: { 'Authorization': `Bearer ${token}` } } as any,
      requestInit: { headers: { 'Authorization': `Bearer ${token}` } }
    }
  );

  const client = new Client(
    { name: 'claude-test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.log('Connected! Calling sera_threads_publish...');

  const result = await client.callTool({
    name: 'sera_threads_publish',
    arguments: {
      text: 'Testing SERA OS Autonomous Social Action via Claude MCP'
    }
  });

  console.log('\nThreads Tool Result:\n', JSON.stringify(result, null, 2));
  await client.close();
}

testThreadsPublish().catch(console.error);

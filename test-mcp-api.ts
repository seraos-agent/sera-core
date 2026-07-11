import 'dotenv/config';

async function testREST() {
  console.log('Testing SERA Internal MCP REST API...');
  const secret = process.env.SERA_MCP_SECRET;
  
  try {
    const res = await fetch('http://127.0.0.1:3001/api/mcp/memory', {
      headers: { 'Authorization': `Bearer ${secret}` }
    });
    
    if (!res.ok) {
      console.error(`❌ HTTP Error: ${res.status} ${res.statusText}`);
      const err = await res.text();
      console.error(err);
      return;
    }
    
    const data = await res.json();
    console.log('✅ Success! Memory retrieved:');
    console.log(data.text ? data.text.substring(0, 100) + '...' : 'No memory');
    
    console.log('\nTesting Proposal submission...');
    const res2 = await fetch('http://127.0.0.1:3001/api/mcp/proposal', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'transfer_funds',
        target: '0x123...',
        amount: '10',
        asset: 'USDC',
        description: 'Testing MCP proxy proposal submission'
      })
    });
    
    if (!res2.ok) {
      console.error(`❌ HTTP Error on proposal: ${res2.status} ${res2.statusText}`);
      const err = await res2.text();
      console.error(err);
      return;
    }
    
    const data2 = await res2.json();
    console.log('✅ Proposal Success:', data2);
    
  } catch (err: any) {
    console.error('❌ Fetch failed:', err.message);
  }
}

testREST().catch(console.error);

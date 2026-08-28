async function testStatelessPost() {
  const token = "sera_mcp_at_eyJzdWIiOiIweGVjMTVhOWUyNWUxYmVjMjFkOTYwOTIwZjk5ZWM0NmEyOWQ2YWZlMTEiLCJjaWQiOiJjbGF1ZGUtYWktbWNwIiwic2NwIjoibWNwOmFsbCIsImV4cCI6MTc5MDQ0MTU1MDc4MCwibm9uY2UiOiI2ZjljOGRhYjEwOTA0MmRjIn0.c939e4e0a6cda424afd799da3ba60495f092935c9ccda7c2051c8e30ebb3de94";
  const fakeSessionId = "fake-session-" + Date.now();

  console.log("Testing POST /message without active SSE transport (Cross-replica simulation)...");

  const response = await fetch(`https://mcp.seraos.xyz/message?sessionId=${fakeSessionId}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 42,
      method: "tools/call",
      params: {
        name: "sera_wallet_balance",
        arguments: {}
      }
    })
  });

  console.log("HTTP Status:", response.status);
  const data = await response.json();
  console.log("JSON-RPC Response:", JSON.stringify(data, null, 2));
}

testStatelessPost().catch(console.error);

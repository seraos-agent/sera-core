async function verifyHealthAndTemporal() {
  const rootUrl = 'https://mcp.seraos.xyz';
  
  // Health
  const healthRes = await fetch(`${rootUrl}/health`);
  console.log('Health Status:', healthRes.status, await healthRes.json());

  // Temporal Tick Unauthorized
  const badTick = await fetch(`${rootUrl}/api/temporal/tick`, { method: 'POST' });
  console.log('Unauthorized Tick Status (Expect 401):', badTick.status);

  // Temporal Tick Authorized
  const goodTick = await fetch(`${rootUrl}/api/temporal/tick`, {
    method: 'POST',
    headers: {
      'x-cron-key': 'sera-temporal-cron-key-2026'
    }
  });
  console.log('Authorized Tick Status (Expect 200):', goodTick.status, await goodTick.json());
}

verifyHealthAndTemporal().catch(console.error);

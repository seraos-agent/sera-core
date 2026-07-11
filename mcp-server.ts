import 'dotenv/config';
import { McpServerProxy } from './src/capabilities/mcp/server/McpServerProxy';

async function main() {
  const proxy = new McpServerProxy();
  await proxy.start();
}

main().catch(console.error);

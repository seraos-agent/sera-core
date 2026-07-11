import { EventEmitter } from 'events';
import { CapabilityCatalog } from './src/core/capabilities/CapabilityCatalog';
import { McpClientAdapter } from './src/capabilities/mcp/client/McpClientAdapter';

async function testMCP() {
  console.log('--- Starting MCP Integration Test ---');
  
  const eventBus = new EventEmitter();
  const catalog = new CapabilityCatalog();

  const mcpMemoryClient = new McpClientAdapter(
    'memory-server',
    'npx',
    ['-y', '@modelcontextprotocol/server-memory'],
    eventBus,
    catalog
  );

  console.log('Connecting to MCP server...');
  await mcpMemoryClient.connect();

  const tools = catalog.availableTools();
  console.log(`\nDiscovered ${tools.length} tools in CapabilityCatalog:`);
  tools.forEach(t => console.log(`- ${t.name}: ${t.description}`));

  if (tools.length === 0) {
    console.error('❌ Failed: No tools were registered from MCP server.');
    process.exit(1);
  } else {
    console.log('✅ Success: MCP Tools discovered and registered!');
    process.exit(0);
  }
}

testMCP().catch(console.error);

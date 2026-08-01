/**
 * @deprecated This proxy has been superseded by the full SeraMcpServer in src/mcp/.
 *
 * The new architecture:
 * - SeraMcpServer (src/mcp/SeraMcpServer.ts) — Core MCP server with tool handlers
 * - sera-mcp-stdio (src/mcp/sera-mcp-stdio.ts) — Stdio entrypoint for Claude Desktop
 * - HTTP routes in server/index.ts — /mcp/tools and /mcp/tool endpoints
 *
 * This file is kept for reference only. Use src/mcp/sera-mcp-stdio.ts for stdio transport.
 */

export { SeraMcpServer } from '../../../mcp/SeraMcpServer';

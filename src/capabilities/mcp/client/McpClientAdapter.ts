import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { EventEmitter } from 'events';
import { CapabilityCatalog } from '../../../core/capabilities/CapabilityCatalog';
import { SeraTool } from '../../../core/cognitive/Tool';
import { EventTypes, StandardEvent, GoalResultPayload } from '../../../core/events/types';
import { Logger } from '../../../core/logging/Logger';

export class McpClientAdapter {
  private client: Client;
  private transport: StdioClientTransport | null = null;
  private logger = new Logger('McpClientAdapter');
  private supportedTools: Set<string> = new Set();
  
  constructor(
    private serverName: string,
    private command: string,
    private args: string[],
    private eventBus: EventEmitter,
    private catalog: CapabilityCatalog
  ) {
    this.client = new Client(
      {
        name: `sera-client-${serverName}`,
        version: '1.0.0',
      },
      {
        capabilities: {},
      }
    );
    
    this.eventBus.on(EventTypes.DOMAIN_ACTION_DISPATCHED, this.handleAction.bind(this));
  }

  public async connect(): Promise<void> {
    this.logger.info(`Connecting to MCP Server '${this.serverName}' via stdio: ${this.command} ${this.args.join(' ')}`);
    
    try {
      this.transport = new StdioClientTransport({
        command: this.command,
        args: this.args,
        env: process.env as Record<string, string>
      });
      
      await this.client.connect(this.transport);
      this.logger.info(`Successfully connected to MCP Server '${this.serverName}'`);
      
      await this.discoverTools();
    } catch (e: any) {
      this.logger.error(`Failed to connect to MCP Server '${this.serverName}': ${e.message}`);
    }
  }

  private async discoverTools(): Promise<void> {
    try {
      const response = await this.client.listTools();
      const tools = response.tools || [];
      
      if (tools.length === 0) {
        this.logger.info(`MCP Server '${this.serverName}' exposes no tools.`);
        return;
      }

      const seraTools: SeraTool[] = tools.map((t: any) => {
        this.supportedTools.add(t.name);
        return {
          name: t.name,
          description: `[MCP: ${this.serverName}] ${t.description || ''}`,
          parameters: t.inputSchema || {}
        };
      });

      this.catalog.registerTools(seraTools);
      this.logger.info(`Registered ${seraTools.length} tools from MCP Server '${this.serverName}' into CapabilityCatalog.`);
    } catch (e: any) {
      this.logger.error(`Failed to discover tools from '${this.serverName}': ${e.message}`);
    }
  }

  private async handleAction(event: StandardEvent): Promise<void> {
    const { actionType, actionPayload, context } = event.payload;
    const requestId = context?.triggerId || `req-${Date.now()}`;
    
    // Check if the requested tool is managed by this MCP server
    if (!this.supportedTools.has(actionType)) {
      return; // Not our tool, ignore
    }

    this.logger.info(`Executing MCP Tool '${actionType}' on server '${this.serverName}'`);

    try {
      const result = await this.client.callTool({
        name: actionType,
        arguments: actionPayload || {}
      });

      let success = true;
      if (result.isError) {
        success = false;
      }
      
      // Combine all text contents from the MCP response
      let stringResult = '';
      if (result.content && Array.isArray(result.content)) {
        stringResult = result.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
      } else {
         stringResult = JSON.stringify(result);
      }

      this.emitResult(requestId, success, { output: stringResult }, result.isError ? stringResult : undefined);
    } catch (error: any) {
      this.logger.error(`Error executing MCP Tool '${actionType}': ${error.message}`);
      this.emitResult(requestId, false, {}, error.message);
    }
  }

  private emitResult(requestId: string, success: boolean, data: Record<string, any>, errorMessage?: string): void {
    const resultPayload: GoalResultPayload = { requestId, success, data, errorMessage };
    const event: StandardEvent = {
      id: `evt-mcp-result-${Date.now()}`,
      type: EventTypes.DOMAIN_GOAL_RESULT,
      source: 'McpClientAdapter',
      correlationId: requestId,
      payload: resultPayload,
      timestamp: Date.now(),
    };
    this.eventBus.emit(EventTypes.DOMAIN_GOAL_RESULT, event);
  }
}

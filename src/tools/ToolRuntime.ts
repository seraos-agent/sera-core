import { ToolRegistry } from './ToolRegistry';
import { ToolRequest, ToolResult } from './types';

export class ToolRuntime {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async execute(request: ToolRequest): Promise<ToolResult> {
    console.log(`[ToolRuntime] Received request for tool: ${request.toolId}`);
    
    const tool = this.registry.getTool(request.toolId);
    
    if (!tool) {
      console.log(`[ToolRuntime] Error: Tool not found - ${request.toolId}`);
      return {
        status: 'FAILURE',
        output: {},
        metadata: { error: 'Tool not found' }
      };
    }

    try {
      console.log(`[ToolRuntime] Executing tool: ${tool.id}`);
      const result = await tool.execute(request);
      return result;
    } catch (error: any) {
      console.log(`[ToolRuntime] Execution failed:`, error.message);
      return {
        status: 'FAILURE',
        output: {},
        metadata: { error: error.message }
      };
    }
  }
}

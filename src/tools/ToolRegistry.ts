import { Tool } from './types';

export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
    console.log(`[ToolRegistry] Registered Tool: ${tool.id}`);
  }

  getTool(toolId: string): Tool | undefined {
    return this.tools.get(toolId);
  }
}

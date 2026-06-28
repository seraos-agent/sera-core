import { Tool, ToolRequest, ToolResult } from './types';

export class MockReadTool implements Tool {
  id = 'mock-read-tool';
  capabilities = ['fetch_data', 'read_content'];

  async execute(request: ToolRequest): Promise<ToolResult> {
    console.log(`[MockReadTool] Simulating execution of action: ${request.action}`);
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return {
      status: 'SUCCESS',
      output: {
        data: 'Simulated retrieved data',
        sourcePayload: request.payload
      }
    };
  }
}

import { Tool, ToolRequest, ToolResult } from './types';

export class MockFailVerificationTool implements Tool {
  id = 'mock-fail-verification-tool';
  capabilities = ['execute_payment'];

  async execute(request: ToolRequest): Promise<ToolResult> {
    console.log(`[MockFailVerificationTool] Simulating execution of action: ${request.action}`);
    
    // Simulate failing explicitly so VerificationService will fail
    return {
      status: 'FAILURE',
      output: {
        error: 'Execution failed or not verifiable'
      }
    };
  }
}

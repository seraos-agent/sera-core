export interface ToolRequest {
  toolId: string;
  action: string;
  payload: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface ToolResult {
  status: 'SUCCESS' | 'FAILURE';
  output: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface VerificationResult {
  verified: boolean;
  evidence: Record<string, any>;
  reason: string;
}

export interface Tool {
  id: string;
  capabilities: string[];
  execute(request: ToolRequest): Promise<ToolResult>;
}

export interface AdminUser {
  id: string;
  email: string;
  role?: string;
  authMethod: 'supabase_jwt' | 'secret_key' | 'admin_key';
}

export interface AdminOverview {
  totalUsers: number;
  activeSessions: number;
  activeTriggers: number;
  activeAutomations: number;
  activeCloudConnections: number;
  uptimeSeconds: number;
  serverTimestamp: number;
  nodeVersion: string;
  adminUser?: AdminUser;
}

export interface UserConnections {
  googleDrive: boolean;
  threads: boolean;
  telegram: boolean;
  claude: boolean;
  hyperliquid: boolean;
  whatsapp: boolean;
  baseWallet: boolean;
}

export interface UserSummary {
  id: string;
  walletAddress?: string;
  agentVaultAddress?: string;
  isInstanceActive: boolean;
  agentCredits: number;
  subscriptionTier: 'FREE' | 'STARTER' | 'PRO' | 'UNLIMITED';
  activeTriggersCount: number;
  connections: UserConnections;
  createdAt: number;
  lastActiveAt: number;
}

export interface TriggerItem {
  id: string;
  type: string;
  condition?: any;
  action?: any;
  prompt?: string;
  task?: string;
  createdAt?: number;
  lastTriggeredAt?: number;
}

export interface MemoryBelief {
  belief: string;
  type?: string;
  confidence?: number;
  updatedAt?: number;
}

export interface AutonomyAgreement {
  id: string;
  toolIntent: string;
  scope?: string;
  grantedAt?: number;
  status?: string;
}

export interface CloudConnection {
  provider: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  revoked_at?: string;
}

export interface UserDetail {
  id: string;
  walletAddress?: string;
  agentVaultAddress?: string;
  walletAccounts?: Array<{
    id?: string;
    kind: 'PERSONAL' | 'AGENT';
    provider: string;
    chain: string;
    address: string;
    status: string;
  }>;
  isInstanceActive: boolean;
  agentCredits: number;
  subscriptionTier: string;
  telegramId?: string | null;
  activatedConnectors?: string[];
  connections?: UserConnections;
  triggers: TriggerItem[];
  memoryBeliefs: MemoryBelief[];
  agreements: AutonomyAgreement[];
  cloudConnections: CloudConnection[];
}

export interface GlobalTrigger extends TriggerItem {
  sessionId: string;
  walletAddress?: string;
}

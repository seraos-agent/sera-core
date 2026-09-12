import { Socket } from 'socket.io';
import { AgentManager } from '../../AgentManager';
import { GoogleDriveOAuthService } from '../../../core/integrations/google-drive/GoogleDriveOAuthService';
import { ThreadsOAuthService } from '../../auth/threadsAuth';
import { TelegramBotManager } from '../../../capabilities/communication/adapters/TelegramBotManager';
import { WhatsAppManager } from '../../../capabilities/communication/adapters/WhatsAppManager';
import { McpApiKeyStore } from '../../../mcp/McpApiKeyStore';
import { OAuthStore } from '../../auth/oauth/OAuthStore';
import { SupabaseIdentityService } from '../../../core/identity/SupabaseIdentityService';
import { ReownWalletIdentityService } from '../../../core/identity/ReownWalletIdentityService';
import { SeraAgentInstance } from '../../SeraAgentInstance';
import { WalletLinkChallenge } from '../socketAuth';

export interface SocketGatewayDependencies {
  agentManager: AgentManager;
  googleDriveOAuthService: GoogleDriveOAuthService | null;
  threadsOAuthService: ThreadsOAuthService;
  telegramBotManager: TelegramBotManager;
  whatsAppManager: WhatsAppManager;
  mcpApiKeyStore: McpApiKeyStore;
  globalOAuthStore: OAuthStore;
  globalSecretManager: any;
  supabaseIdentityService: SupabaseIdentityService | null;
  reownWalletIdentityService: ReownWalletIdentityService | null;
}

export interface SocketSessionContext {
  socket: Socket;
  deps: SocketGatewayDependencies;
  getInstance: () => SeraAgentInstance;
  setInstance: (instance: SeraAgentInstance) => void;
  sendInitialState: () => Promise<void>;
  bindListeners: () => void;
  unbindListeners: () => void;
  getWalletLinkChallenge: () => WalletLinkChallenge | undefined;
  setWalletLinkChallenge: (challenge: WalletLinkChallenge | undefined) => void;
  getSocketObservationBuffer: () => any[];
  clearSocketObservationBuffer: () => void;
  getSessionCognitiveSteps: () => any[];
  setSessionCognitiveSteps: (steps: any[]) => void;
  getCurrentTurnStartTime: () => number;
  setCurrentTurnStartTime: (time: number) => void;
  getNextMsgId: () => number;
  updateMsgIdCounter: (id: number) => void;
}

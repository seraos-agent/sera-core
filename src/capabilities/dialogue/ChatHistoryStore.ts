import * as fs from 'fs';
import * as path from 'path';
import { QwenMessage } from '../llm/QwenAdapter';

export interface UiMessage {
  id: number;
  role?: 'user' | 'agent';
  type?: 'activity';
  content?: string;
  proposal?: any;
  actionLinks?: { label: string; url: string }[];
}

export interface ChatHistoryState {
  uiMessages: UiMessage[];
}

export class ChatHistoryStore {
  private basePath: string;
  private filePath: string;
  private state: ChatHistoryState;

  constructor(sessionId: string) {
    this.basePath = path.join(process.cwd(), '.data');
    const safeId = sessionId.toLowerCase().replace(/[^a-z0-9]/g, '');
    this.filePath = path.join(this.basePath, `chat_history_${safeId}.json`);
    this.state = this.load();
  }

  private load(): ChatHistoryState {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data) as ChatHistoryState;
        
        // Filter out ephemeral activity messages from older history saves
        if (parsed.uiMessages) {
          parsed.uiMessages = parsed.uiMessages.filter(msg => msg.type !== 'activity');
        }
        
        return parsed;
      }
    } catch (e) {
      console.error('[ChatHistoryStore] Failed to load chat history:', e);
    }
    return { uiMessages: [] };
  }

  private save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
    } catch (e) {
      console.error('[ChatHistoryStore] Failed to save chat history:', e);
    }
  }

  public getUiMessages(): UiMessage[] {
    return this.state.uiMessages;
  }

  public appendUiMessage(msg: UiMessage): void {
    const existingIndex = this.state.uiMessages.findIndex(m => m.id === msg.id);
    if (existingIndex >= 0) {
      this.state.uiMessages[existingIndex] = msg;
    } else {
      this.state.uiMessages.push(msg);
    }
    this.save();
  }

  public updateProposalStatus(proposalId: string, status: 'APPROVED' | 'REJECTED'): void {
    const msg = this.state.uiMessages.find(m => m.proposal && m.proposal.proposalId === proposalId);
    if (msg && msg.proposal) {
      msg.proposal.status = status;
      this.save();
    }
  }

  public clear(): void {
    this.state = { uiMessages: [] };
    this.save();
  }
}


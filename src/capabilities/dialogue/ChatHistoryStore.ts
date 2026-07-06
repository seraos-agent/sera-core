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
  llmMessages: QwenMessage[];
}

export class ChatHistoryStore {
  private filePath: string;
  private state: ChatHistoryState;

  constructor() {
    this.filePath = path.join(process.cwd(), '.data', 'chat_history.json');
    this.state = this.load();
  }

  private load(): ChatHistoryState {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('[ChatHistoryStore] Failed to load chat history:', e);
    }
    return { uiMessages: [], llmMessages: [] };
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

  public getLlmMessages(): QwenMessage[] {
    return this.state.llmMessages;
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

  public appendLlmMessage(msg: QwenMessage): void {
    this.state.llmMessages.push(msg);
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
    this.state = { uiMessages: [], llmMessages: [] };
    this.save();
  }
}

export const chatHistoryStore = new ChatHistoryStore();

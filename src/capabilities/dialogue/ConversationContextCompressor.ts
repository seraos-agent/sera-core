import { QwenMessage } from '../llm/QwenAdapter';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ConversationContextOptions {
  tokenBudget: number;
  maxRecentTurns: number;
}

export interface CompressedConversationContext {
  messages: QwenMessage[];
  estimatedTokens: number;
  truncated: boolean;
}

/**
 * Bounds dialogue history before it enters an LLM prompt.
 *
 * This intentionally performs only deterministic clipping. It never converts
 * conversation into durable memory or asserts that a prior utterance is true.
 */
export class ConversationContextCompressor {
  public compress(
    turns: ConversationTurn[],
    options: ConversationContextOptions
  ): CompressedConversationContext {
    const budget = Math.max(0, options.tokenBudget);
    const normalized = turns
      .filter(turn => Boolean(turn.content?.trim()))
      .map(turn => ({ role: turn.role, content: turn.content.trim() }));

    const recentStart = Math.max(0, normalized.length - Math.max(0, options.maxRecentTurns));
    const olderTurns = normalized.slice(0, recentStart);
    const recentTurns = normalized.slice(recentStart);
    const olderBudget = olderTurns.length > 0 ? Math.floor(budget * 0.3) : 0;
    const recentBudget = budget - olderBudget;

    const older = this.fitTurns(olderTurns, olderBudget, true);
    const recent = this.fitTurns(recentTurns, recentBudget, false);
    return {
      messages: [...older.messages, ...recent.messages],
      estimatedTokens: older.estimatedTokens + recent.estimatedTokens,
      truncated: older.truncated || recent.truncated
    };
  }

  private fitTurns(turns: ConversationTurn[], tokenBudget: number, condensed: boolean): CompressedConversationContext {
    if (tokenBudget <= 0 || turns.length === 0) {
      return { messages: [], estimatedTokens: 0, truncated: turns.length > 0 };
    }

    const selected: QwenMessage[] = [];
    let used = 0;
    let truncated = false;

    // Newest turns are most likely to resolve references in the current request.
    for (const turn of [...turns].reverse()) {
      const remaining = tokenBudget - used;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      const prefix = condensed ? '[Earlier context, condensed] ' : '';
      const prefixTokens = this.estimateTokens(prefix);
      if (remaining <= prefixTokens) {
        truncated = true;
        break;
      }

      const maxContentTokens = Math.min(remaining - prefixTokens, condensed ? 56 : 220);
      const { content, truncated: clipped } = this.truncate(turn.content, maxContentTokens);
      if (!content) {
        truncated = true;
        continue;
      }

      selected.push({ role: turn.role, content: `${prefix}${content}` });
      used += prefixTokens + this.estimateTokens(content);
      truncated ||= clipped;
    }

    if (selected.length < turns.length) truncated = true;
    return { messages: selected.reverse(), estimatedTokens: used, truncated };
  }

  private truncate(content: string, tokenBudget: number): { content: string; truncated: boolean } {
    if (tokenBudget <= 0) return { content: '', truncated: true };
    if (this.estimateTokens(content) <= tokenBudget) return { content, truncated: false };
    if (tokenBudget === 1) return { content: '…', truncated: true };
    return {
      content: `${content.slice(0, Math.max(0, (tokenBudget - 1) * 4)).trim()}…`,
      truncated: true
    };
  }

  private estimateTokens(content: string): number {
    return Math.max(1, Math.ceil(content.length / 4));
  }
}

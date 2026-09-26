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
 * Implements Recency-Aware Compression & Saliency Filtering to solve
 * context window saturation and recency decay across extended (>20-30 turn) conversations.
 *
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 */
export class ConversationContextCompressor {
  private static readonly LOW_SIGNAL_FILLER_REGEX =
    /^(?:ok|oke|sip|siap|makasih|terima kasih|terimakasih|sama-sama|halo|hai|hi|hello|cool|thanks|thx|got it|noted|baiklah|mantap|yup|ya)[.!?,]?$/i;

  public compress(
    turns: ConversationTurn[],
    options: ConversationContextOptions
  ): CompressedConversationContext {
    const budget = Math.max(0, options.tokenBudget);
    const normalized = turns
      .filter(turn => Boolean(turn.content?.trim()))
      .map(turn => ({ role: turn.role, content: turn.content.trim() }));

    const totalTurns = normalized.length;
    const recentCount = Math.max(0, options.maxRecentTurns);
    const recentStart = Math.max(0, totalTurns - recentCount);

    const olderTurns = normalized.slice(0, recentStart);
    const recentTurns = normalized.slice(recentStart);

    // Initial budget split: 30% older history, 70% recent turns
    const nominalOlderBudget = olderTurns.length > 0 ? Math.floor(budget * 0.3) : 0;

    // Filter low-signal conversational filler turns from older history to preserve factual density
    const filteredOlderTurns = olderTurns.filter(turn => {
      // Keep user turns unless purely trivial filler; keep assistant turns with high factual content
      return !ConversationContextCompressor.LOW_SIGNAL_FILLER_REGEX.test(turn.content);
    });

    const older = this.fitTurns(filteredOlderTurns, nominalOlderBudget, true, totalTurns, 0);

    // Dynamic budget spillover: unused older budget is safely given to recent turns
    const unusedOlderBudget = Math.max(0, nominalOlderBudget - older.estimatedTokens);
    const dynamicRecentBudget = (budget - nominalOlderBudget) + unusedOlderBudget;

    const recent = this.fitTurns(recentTurns, dynamicRecentBudget, false, totalTurns, recentStart);

    return {
      messages: [...older.messages, ...recent.messages],
      estimatedTokens: older.estimatedTokens + recent.estimatedTokens,
      truncated: older.truncated || recent.truncated
    };
  }

  private fitTurns(
    turns: ConversationTurn[],
    tokenBudget: number,
    condensed: boolean,
    totalTurns: number,
    turnStartIndex: number
  ): CompressedConversationContext {
    if (tokenBudget <= 0 || turns.length === 0) {
      return { messages: [], estimatedTokens: 0, truncated: turns.length > 0 };
    }

    const selected: QwenMessage[] = [];
    let used = 0;
    let truncated = false;

    // Process from newest to oldest in this slice
    const reversedTurns = [...turns].reverse();

    for (let i = 0; i < reversedTurns.length; i++) {
      const turn = reversedTurns[i];
      const remaining = tokenBudget - used;
      if (remaining <= 0) {
        truncated = true;
        break;
      }

      // Calculate relative recency distance from the latest active turn
      const originalIndex = turnStartIndex + (turns.length - 1 - i);
      const turnsAgo = Math.max(1, totalTurns - originalIndex);

      // Prefix gives LLM explicit temporal anchoring and avoids recency bleed
      const prefix = condensed
        ? (turnsAgo > 4 ? `[Earlier context, condensed | T-${turnsAgo} turns ago] ` : '[Earlier context, condensed] ')
        : '';

      const prefixTokens = this.estimateTokens(prefix);
      if (remaining <= prefixTokens) {
        truncated = true;
        break;
      }

      const maxContentTokens = Math.min(remaining - prefixTokens, condensed ? 1000 : 4000);
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

    const targetCharLength = Math.max(0, (tokenBudget - 1) * 4);
    let sliced = content.slice(0, targetCharLength).trim();

    // Clean boundary truncation: avoid cutting in the middle of a word if possible
    const lastSpace = sliced.lastIndexOf(' ');
    if (lastSpace > targetCharLength * 0.7) {
      sliced = sliced.slice(0, lastSpace);
    }

    return {
      content: `${sliced}…`,
      truncated: true
    };
  }

  private estimateTokens(content: string): number {
    return Math.max(1, Math.ceil(content.length / 4));
  }
}

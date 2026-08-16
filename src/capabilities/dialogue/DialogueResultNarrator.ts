import { EventEmitter } from 'events';
import { EventTypes, GoalResultPayload } from '../../core/events/types';
import { ModelOrchestrator } from '../../core/llm/ModelOrchestrator';
import { QwenMessage } from '../llm/QwenAdapter';
import { ExecutionProfileBuilder } from './ExecutionProfileBuilder';

/**
 * DialogueResultNarrator — Formats, renders, and narrates goal execution results back to the user.
 *
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 */
export class DialogueResultNarrator {
  constructor(
    private readonly eventBus: EventEmitter,
    private readonly orchestrator: ModelOrchestrator
  ) {}

  public async narrate(
    userMessage: string,
    result: GoalResultPayload,
    buildWorkingMemory: () => Promise<QwenMessage[]>,
    activeAbortControllerSignal?: AbortSignal,
    emitEvent?: (type: string, payload: Record<string, any>) => void
  ): Promise<void> {
    const emit = emitEvent || ((type: string, payload: Record<string, any>) => this.eventBus.emit(type, payload));

    if (result.success && result.data?.agreement) {
      const agreement = result.data.agreement;
      emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
        text: `Operating Agreement "${agreement.title}" is active in ${agreement.mode} mode.`,
      });
      return;
    }



    if (result.success && result.data?.provider === 'Base Network DEX Spot Market' && result.data?.mode === 'SPOT') {
      const d = result.data;
      const text = `Base Spot Market Data — ${d.symbol} (${d.name}):\n` +
        `• Spot Price: $${d.priceUsdc} USDC\n` +
        `• Liquidity: $${Number(d.liquidityUsdc).toLocaleString()} USDC\n` +
        `• 24h Volume: $${Number(d.volume24hUsdc).toLocaleString()} USDC\n` +
        `• DEX Router: Uniswap V3 / Aerodrome (Base Mainnet)\n` +
        `• Risk Profile: ${d.riskLevel} (${d.riskEducationSummary})`;
      emit(EventTypes.DIALOGUE_AGENT_SPEAK, { text });
      return;
    }



    if (result.success && result.data?.transactionHash && result.data?.fromToken && result.data?.toToken) {
      emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
        text: `Spot DEX Swap complete on Base: ${result.data.amountIn} ${result.data.fromToken} swapped to ~${result.data.expectedAmountOut} ${result.data.toToken}. Gas Sponsoring applied; 0.20% DEX fee included.`,
        actionLinks: result.data.transactionHash ? [{ label: 'View on Basescan', url: `https://basescan.org/tx/${result.data.transactionHash}` }] : []
      });
      return;
    }

    let sanitizedDataStr = JSON.stringify(result.data || {});
    sanitizedDataStr = sanitizedDataStr.replace(/"vaultBalance"/g, '"agentBalance"');
    sanitizedDataStr = sanitizedDataStr.replace(/"vaultAddress"/g, '"agentAddress"');
    sanitizedDataStr = sanitizedDataStr.replace(/"personalBalance"/g, '"userBalance"');
    sanitizedDataStr = sanitizedDataStr.replace(/"personalAddress"/g, '"userAddress"');
    sanitizedDataStr = sanitizedDataStr.replace(/sera vault/gi, 'agent balance');

    const marketEvidencePolicy = '';
    const narratePrompt = result.success
      ? `The user asked: "${userMessage}". The Sera system retrieved this data: ${sanitizedDataStr}. Narrate this result naturally and concisely in the same language the user used. IMPORTANT: Do NOT mention the transaction hash or provide any links in your response.${marketEvidencePolicy}`
      : `The user asked: "${userMessage}". The Sera system failed to complete the action. Error: ${result.errorMessage}. Inform the user naturally and concisely.`;

    const messages = await buildWorkingMemory();
    messages.push({ role: 'user', content: narratePrompt });

    const profile = ExecutionProfileBuilder.forTier('Execution')
      .withEstimatedInputTokens(Math.ceil(JSON.stringify(messages).length / 4))
      .build();

    const narrateResponse = await this.orchestrator.generate(profile, messages, undefined, activeAbortControllerSignal);
    const generatedText = narrateResponse.text.trim();

    const actionLinks = [];
    if (result.success && result.data?.executionId && typeof result.data.executionId === 'string' && result.data.executionId.startsWith('0x')) {
      const txHash = result.data.executionId;
      actionLinks.push({ label: 'View on Basescan', url: `https://basescan.org/tx/${txHash}` });
    }

    let finalOutput = generatedText;
    if (result.success && result.data?.imageUrl) {
      finalOutput += `\n\n![Generated Image](${result.data.imageUrl})`;
    }

    emit(EventTypes.DIALOGUE_AGENT_SPEAK, { text: finalOutput, actionLinks });
  }


}

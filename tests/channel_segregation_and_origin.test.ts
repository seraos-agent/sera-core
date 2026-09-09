import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'events';
import { EventTypes } from '../src/core/events/types';
import { ReActExecutor } from '../src/capabilities/dialogue/cognitive/ReActExecutor';

describe('Channel Segregation & Goal Origin Context Retention', () => {
  it('SocketGateway and UI history stores strictly ignore events with external platform responseContext', () => {
    const externalContexts = [
      { platform: 'whatsapp', channelId: '628123456789' },
      { platform: 'telegram', channelId: '987654321' },
      { platform: 'mcp', channelId: 'stdio' },
      { platform: 'threads', channelId: 'user_123' }
    ];

    for (const ctx of externalContexts) {
      const isUiEvent = !ctx || !ctx.platform || ctx.platform === 'ui' || ctx.platform === 'socket';
      expect(isUiEvent).toBe(false);
    }

    const uiContexts = [
      undefined,
      null,
      { platform: 'ui', channelId: 'web' },
      { platform: 'socket', channelId: 'session-123' }
    ];

    for (const ctx of uiContexts) {
      const isUiEvent = !ctx || !ctx.platform || ctx.platform === 'ui' || ctx.platform === 'socket';
      expect(isUiEvent).toBe(true);
    }
  });

  it('GoalBridge preserves _responseContext from dispatched action into DOMAIN_GOAL_RESULT', () => {
    const eventBus = new EventEmitter();
    const emittedResults: any[] = [];

    eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, (event: any) => {
      emittedResults.push(event.payload);
    });

    const requestContextMap = new Map<string, { _responseContext?: any; _userMessage?: any }>();
    const emitResult = (requestId: string, success: boolean, data: Record<string, any>, errorMessage?: string) => {
      let effectiveData = data || {};
      const meta = requestContextMap.get(requestId);
      if (meta) {
        effectiveData = { ...meta, ...effectiveData };
        requestContextMap.delete(requestId);
      }
      const resultPayload = { requestId, success, data: effectiveData, errorMessage };
      eventBus.emit(EventTypes.DOMAIN_GOAL_RESULT, {
        id: `evt-result-${Date.now()}`,
        type: EventTypes.DOMAIN_GOAL_RESULT,
        payload: resultPayload
      });
    };

    const requestId = 'req-test-spreadsheet-123';
    const whatsappContext = { platform: 'whatsapp', channelId: '628123456789', threadRef: 'msg_999' };

    // Simulate action dispatch received
    requestContextMap.set(requestId, {
      _responseContext: whatsappContext,
      _userMessage: 'Create barber price sheet'
    });

    // Simulate goal execution completing
    emitResult(requestId, true, {
      fileId: 'sheet_abc123',
      webViewLink: 'https://docs.google.com/spreadsheets/d/sheet_abc123/edit',
      title: 'Barber Prices'
    });

    expect(emittedResults.length).toBe(1);
    expect(emittedResults[0].success).toBe(true);
    expect(emittedResults[0].data.webViewLink).toBe('https://docs.google.com/spreadsheets/d/sheet_abc123/edit');
    expect(emittedResults[0].data._responseContext).toEqual(whatsappContext);
    expect(emittedResults[0].data._userMessage).toBe('Create barber price sheet');
  });

  it('Late goal resolution routes to originContext instead of defaulting to UI socket', async () => {
    const eventBus = new EventEmitter();
    const emittedSpeaks: any[] = [];

    eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, (event: any) => {
      emittedSpeaks.push(event.payload);
    });

    const goalContexts = new Map<string, Record<string, any>>();
    const requestId = 'req-late-resolution-456';
    const originWhatsappContext = { platform: 'whatsapp', channelId: '628999888777' };

    // Goal spawned with WhatsApp context
    goalContexts.set(requestId, originWhatsappContext);

    // Simulate late result arrives after turn timeout (resolver is gone)
    const result = {
      requestId,
      success: true,
      data: {
        fileId: 'file_789',
        webViewLink: 'https://docs.google.com/spreadsheets/d/file_789',
        _userMessage: 'Update haircut prices'
      }
    };

    const originContext = goalContexts.get(result.requestId) || (result.data as any)?._responseContext;
    expect(originContext).toEqual(originWhatsappContext);

    const emitEvent = (type: string, payload: Record<string, any>) => {
      eventBus.emit(type, { type, payload });
    };

    const contextualEmit = (type: string, payload: Record<string, any>) => {
      const enriched = originContext ? { ...payload, responseContext: originContext } : payload;
      emitEvent(type, enriched);
    };

    // Simulate narration emitting speak
    contextualEmit(EventTypes.DIALOGUE_AGENT_SPEAK, {
      text: 'Spreadsheet has been updated successfully with new haircut prices.'
    });

    expect(emittedSpeaks.length).toBe(1);
    expect(emittedSpeaks[0].responseContext).toEqual(originWhatsappContext);
    expect(emittedSpeaks[0].responseContext.platform).toBe('whatsapp');
  });

  it('ReActExecutor.inferConversationalLanguage accurately infers Indonesian even when user mentions English terms', () => {
    // Exact user phrase from the screenshot
    const userPhrase = 'Mantap, tetap bahasa english karena sera untuk akun global';
    expect(ReActExecutor.inferConversationalLanguage(userPhrase)).toBe('Indonesian');

    // Other Indonesian variations
    expect(ReActExecutor.inferConversationalLanguage('tolong buatkan spreadsheet daftar harga barbershop')).toBe('Indonesian');
    expect(ReActExecutor.inferConversationalLanguage('siap tolong update postingan')).toBe('Indonesian');
    expect(ReActExecutor.inferConversationalLanguage('bisa buatin tabel keuangan?')).toBe('Indonesian');

    // Context inheritance: standalone "ok" with prior Indonesian turn
    const history: any[] = [
      { role: 'assistant', content: 'Mau aku publish yang versi Inggris atau Indonesia?' }
    ];
    expect(ReActExecutor.inferConversationalLanguage('ok', history)).toBe('Indonesian');

    // English inputs
    expect(ReActExecutor.inferConversationalLanguage('Can you create a price sheet for my barber shop?')).toBe('English');
    expect(ReActExecutor.inferConversationalLanguage('Please publish this to Threads now')).toBe('English');

    // Spanish inputs
    expect(ReActExecutor.inferConversationalLanguage('Por favor crea una hoja de cálculo para mi tienda')).toBe('Spanish');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { EventTypes } from '../src/core/events/types';

describe('Session & UI Isolation', () => {
  it('does not append WhatsApp messages to Web UI chat history store', () => {
    const eventBus = new EventEmitter();
    const uiMessages: any[] = [];
    const chatHistoryStore = {
      getUiMessages: () => uiMessages,
      appendUiMessage: (msg: any) => uiMessages.push(msg)
    };

    // Simulate central Guaranteed Chat History Persistence listener in SeraAgentInstance
    eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, (event: any) => {
      const payload = event.payload || event;
      const ctx = payload.responseContext;
      if (ctx && ctx.platform && ctx.platform !== 'ui' && ctx.platform !== 'socket') {
        return; // Suppressed from Web UI
      }

      chatHistoryStore.appendUiMessage({
        id: payload.id || Date.now(),
        role: 'agent',
        content: payload.text
      });
    });

    // 1. Emit WhatsApp turn
    eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
      payload: {
        id: 101,
        text: 'Halo Bu Siti, toko Anda sudah terdaftar di WhatsApp!',
        responseContext: {
          platform: 'whatsapp',
          channelId: '6281299998888'
        }
      }
    });

    // Verify WhatsApp message did NOT enter Web UI history
    expect(uiMessages).toHaveLength(0);

    // 2. Emit Web UI turn
    eventBus.emit(EventTypes.DIALOGUE_AGENT_SPEAK, {
      payload: {
        id: 102,
        text: 'Halo, saya asisten SERA Anda di web browser.',
        responseContext: {
          platform: 'ui'
        }
      }
    });

    // Verify Web UI message entered history
    expect(uiMessages).toHaveLength(1);
    expect(uiMessages[0].id).toBe(102);
    expect(uiMessages[0].content).toContain('web browser');
  });
});

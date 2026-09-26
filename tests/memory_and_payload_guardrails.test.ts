import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { ChatHistoryStore } from '../src/capabilities/dialogue/ChatHistoryStore';
import { ReActExecutor } from '../src/capabilities/dialogue/cognitive/ReActExecutor';
import { QwenMessage } from '../src/capabilities/llm/QwenAdapter';

describe('Memory & Payload Guardrails: Preventing Unbounded Growth and Sensory Overload', () => {
  const testSessionId = 'test_guardrail_session_789';
  const dataDir = path.join(process.cwd(), '.data');
  const localHistoryFile = path.join(dataDir, `chat_history_${testSessionId.replace(/[^a-z0-9]/g, '')}.json`);

  beforeEach(() => {
    if (fs.existsSync(localHistoryFile)) {
      fs.unlinkSync(localHistoryFile);
    }
  });

  afterEach(() => {
    if (fs.existsSync(localHistoryFile)) {
      fs.unlinkSync(localHistoryFile);
    }
  });

  describe('ChatHistoryStore UI Retention & Metadata Pruning', () => {
    it('enforces MAX_UI_MESSAGES (30) by sliding window eviction', () => {
      const store = new ChatHistoryStore(testSessionId, { persistLocally: false, supabaseClient: null });

      // Add 40 messages
      for (let i = 1; i <= 40; i++) {
        store.appendUiMessage({
          id: i,
          role: i % 2 === 1 ? 'user' : 'agent',
          content: `Message ${i}`
        });
      }

      const messages = store.getUiMessages();
      expect(messages.length).toBe(ChatHistoryStore.MAX_UI_MESSAGES);
      expect(messages.length).toBe(30);
      // Oldest retained should be Message 11
      expect(messages[0].id).toBe(11);
      expect(messages[messages.length - 1].id).toBe(40);
    });

    it('prunes bulky cognitiveSteps and observations from older turns (keeping last 6 detailed)', () => {
      const store = new ChatHistoryStore(testSessionId, { persistLocally: false, supabaseClient: null });

      // Add 12 messages with cognitiveSteps
      for (let i = 1; i <= 12; i++) {
        store.appendUiMessage({
          id: i,
          role: 'agent',
          content: `Agent response ${i}`,
          cognitiveSteps: [
            { title: 'Thought', detail: `Deep thinking process for step ${i}...`, status: 'completed' },
            { title: 'Tool execution', detail: `Tool call ${i} execution logs...`, status: 'completed' }
          ],
          observations: [{ type: 'sensory', data: `Sensory payload ${i}` }]
        });
      }

      const messages = store.getUiMessages();
      expect(messages.length).toBe(12);

      // Messages older than the last 6 (indices 0..5, ids 1..6) should have cognitiveSteps stripped
      for (let i = 0; i < 6; i++) {
        expect(messages[i].cognitiveSteps).toBeUndefined();
        expect(messages[i].observations).toBeUndefined();
        expect(messages[i].content).toBe(`Agent response ${i + 1}`);
      }

      // The most recent 6 messages (indices 6..11, ids 7..12) MUST retain full cognitiveSteps
      for (let i = 6; i < 12; i++) {
        expect(messages[i].cognitiveSteps).toBeDefined();
        expect(messages[i].cognitiveSteps?.length).toBe(2);
        expect(messages[i].content).toBe(`Agent response ${i + 1}`);
      }
    });
  });

  describe('ReActExecutor Tool Payload Bounding', () => {
    it('leaves normal sized payloads intact', () => {
      const normalPayload = JSON.stringify({ success: true, count: 5, items: ['A', 'B', 'C'] });
      const bounded = ReActExecutor.boundToolPayload(normalPayload);

      expect(bounded.truncated).toBe(false);
      expect(bounded.content).toBe(normalPayload);
    });

    it('safely bounds massive tool outputs exceeding MAX_TOOL_PAYLOAD_CHARS', () => {
      // Create a 25,000 char mock database or spreadsheet dump
      const massiveDump = 'x'.repeat(25000);
      const bounded = ReActExecutor.boundToolPayload(massiveDump);

      expect(bounded.truncated).toBe(true);
      expect(bounded.content.length).toBeLessThan(12000);
      expect(bounded.content).toContain('[SYSTEM REALITY OBSERVATION: Tool output was bounded');
      expect(bounded.content).toContain('25000 chars reduced to');
    });

    it('preserves message pairing and structures during context pruning', () => {
      const executor = new ReActExecutor({} as any, {} as any);

      const messages: QwenMessage[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Initial user query' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'FETCH_DATA', arguments: '{}' } }]
        },
        {
          role: 'tool',
          tool_call_id: 'call_1',
          name: 'FETCH_DATA',
          content: 'A'.repeat(2000) // Older bulky tool payload
        },
        {
          role: 'assistant',
          content: 'Here is a large markdown table:\n| Header 1 | Header 2 |\n|---|---|\n' + '| Row | Data |\n'.repeat(50)
        },
        {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'call_2', type: 'function', function: { name: 'FINAL_TOOL', arguments: '{}' } }]
        },
        {
          role: 'tool',
          tool_call_id: 'call_2',
          name: 'FINAL_TOOL',
          content: '{"result":"success"}' // Latest active tool payload
        }
      ];

      const pruned = (executor as any).pruneBloatedContext(messages);

      // Verify no messages were dropped (pair integrity preserved)
      expect(pruned.length).toBe(messages.length);

      // System prompt and user query untouched
      expect(pruned[0].content).toBe('System prompt');
      expect(pruned[1].content).toBe('Initial user query');

      // Older tool payload (index 3) is condensed cleanly
      expect(pruned[3].content.length).toBeLessThan(600);
      expect(pruned[3].content).toContain('[...earlier tool payload condensed for context efficiency...]');

      // Bulky table in intermediate assistant message (index 4) is condensed
      expect(pruned[4].content).toContain('[...data table condensed for cognitive efficiency...]');

      // Latest active tool payload (index 6) is preserved intact
      expect(pruned[6].content).toBe('{"result":"success"}');
    });
  });
});

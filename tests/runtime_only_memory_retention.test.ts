import { EventEmitter } from 'events';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ChatHistoryStore } from '../src/capabilities/dialogue/ChatHistoryStore';
import { CheckpointStore } from '../src/core/execution/CheckpointStore';
import { VectorMemoryStore } from '../src/core/memory/VectorMemoryStore';
import { InMemoryTriggerStore } from '../src/core/triggers/InMemoryTriggerStore';
import { WorldStateService } from '../src/core/world-state/WorldStateService';
import { EventTypes } from '../src/core/events/types';

const sessionId = `runtime-only-${Date.now()}`;
const safeSessionId = sessionId.replace(/[^a-z0-9]/g, '');
const dataPath = (...parts: string[]) => path.join(process.cwd(), '.data', ...parts);

describe('runtime-only user data retention', () => {
  it('keeps user state in process memory without creating session files', async () => {
    const chat = new ChatHistoryStore(sessionId, { persistLocally: false });
    chat.appendUiMessage({ id: 1, role: 'user', content: 'private message' });

    const vectorMemory = new VectorMemoryStore(sessionId, { persistLocally: false });
    vectorMemory.insert('memory-1', [1, 0], { summary: 'private memory' });

    const triggers = new InMemoryTriggerStore(sessionId, { persistLocally: false });
    triggers.save({
      id: 'trigger-1',
      type: 'TIME',
      state: 'ACTIVE',
      firePolicy: 'ONCE',
      condition: { type: 'EXACT', humanIntent: 'later', timezoneContext: 'UTC' },
      action: { type: 'test', payload: {} },
      createdAt: Date.now(),
    });

    const eventBus = new EventEmitter();
    const worldState = new WorldStateService(eventBus, sessionId, { persistLocally: false });
    eventBus.emit(EventTypes.DOMAIN_WALLET_STATE, {
      payload: { address: '0xabc', vaultAddress: '0xdef', balance: 1, vaultBalance: 0, network: 'base' },
    });

    const checkpoints = new CheckpointStore({ persistLocally: false });
    await checkpoints.save('checkpoint-1', { private: true });

    expect(chat.getUiMessages()).toHaveLength(1);
    expect(vectorMemory.search([1, 0])).toHaveLength(1);
    expect(triggers.getActiveTriggers()).toHaveLength(1);
    expect(worldState.getWalletState()?.address).toBe('0xabc');
    await expect(checkpoints.load('checkpoint-1')).resolves.toEqual({ private: true });

    expect(fs.existsSync(dataPath(`chat_history_${safeSessionId}.json`))).toBe(false);
    expect(fs.existsSync(dataPath(`world_state_${safeSessionId}.json`))).toBe(false);
    expect(fs.existsSync(dataPath(`triggers_${safeSessionId}.json`))).toBe(false);
    expect(fs.existsSync(dataPath('sessions', sessionId, 'vector_memory.json'))).toBe(false);
  });
});

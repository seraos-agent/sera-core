import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SeraAgentInstance } from '../src/server/SeraAgentInstance';
import { FileMemoryPersistence } from '../src/memory/persistence/FileMemoryPersistence';
import { WorkingMemory } from '../src/memory/WorkingMemory';

// Mock FileMemoryPersistence
vi.mock('../src/memory/persistence/FileMemoryPersistence', () => {
  return {
    FileMemoryPersistence: class {
      public load = vi.fn().mockResolvedValue(null);
      public save = vi.fn().mockResolvedValue(undefined);
    }
  };
});

describe('SeraAgentInstance Checkpointing', () => {
  let agent: SeraAgentInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new SeraAgentInstance('test-session');
  });

  it('triggers persistence.save() on temporal.tick', async () => {
    // Suppress console logs for clean test output
    vi.spyOn(console, 'log').mockImplementation(() => {});

    // Need to start the agent so the temporal.tick listener is attached
    await agent.start();

    // Verify load was called on start
    expect(agent.persistence.load).toHaveBeenCalledTimes(1);

    // Add some dummy belief so memory isn't empty
    agent.memoryStore.storeBelief({
      id: 'test',
      category: 'SEMANTIC',
      content: 'test',
      epistemicStatus: 'CONFIRMED',
      confidence: 1,
      evidenceIds: [],
      contradictionIds: [],
      createdAt: 1,
      updatedAt: 1
    });

    // Emit the temporal.tick event, simulating TemporalClockService
    agent.eventBus.emit('temporal.tick', { payload: { timestampUtc: Date.now() } });
    
    // Allow promises to resolve in the event queue
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify save was called (once at start when TemporalClockService starts up + once on tick)
    expect(agent.persistence.save).toHaveBeenCalled();
    
    // Verify the snapshot matches what is in WorkingMemory
    const expectedSnapshot = (agent.memoryStore as WorkingMemory).getSnapshot();
    expect(agent.persistence.save).toHaveBeenCalledWith(expectedSnapshot);
    
    agent.stop();
  });
});

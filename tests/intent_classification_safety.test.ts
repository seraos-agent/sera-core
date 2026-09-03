import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'events';
import { IntentClassifier } from '../src/capabilities/dialogue/IntentClassifier';
import { GoalBridge } from '../src/runtime/GoalBridge';
import { EventTypes } from '../src/core/events/types';

describe('Intent Classification & Conversational Safety', () => {
  it('classifies general text, clear chat, and tool requests with intent NONE so ReAct loop executes', async () => {
    const classifier = new IntentClassifier();

    const sampleQueries = [
      'halo',
      'clear chat',
      'ringkasan bug kemarin',
      'cek market',
      'buatkan spreadsheet keuangan'
    ];

    for (const q of sampleQueries) {
      const res = await classifier.classify(q);
      // intent must ALWAYS be 'NONE' so DialogueEngine delegates to the native ReAct loop
      expect(res.intent).toBe('NONE');
      expect(res.distilledIntent).toBeDefined();
      expect(res.distilledIntent.cognitiveAnchor).toBeDefined();
    }
  });

  it('GoalBridge handles CONVERSATION, NONE, NO_ACTION without erroring', async () => {
    const eventBus = new EventEmitter();
    const goalBridge = new GoalBridge(eventBus, 'test-session');

    const dispatchedActions = ['CONVERSATION', 'NONE', 'NO_ACTION', 'DIRECT_ANSWER'];

    for (const actionType of dispatchedActions) {
      const requestId = `req-test-${actionType}`;
      const resultPromise = new Promise<{ success: boolean; data: any }>((resolve) => {
        const handler = (evt: any) => {
          if (evt.correlationId === requestId) {
            eventBus.off(EventTypes.DOMAIN_GOAL_RESULT, handler);
            resolve(evt.payload);
          }
        };
        eventBus.on(EventTypes.DOMAIN_GOAL_RESULT, handler);
      });

      eventBus.emit(EventTypes.DOMAIN_ACTION_DISPATCHED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DOMAIN_ACTION_DISPATCHED,
        correlationId: requestId,
        payload: {
          actionType,
          requestId
        },
        timestamp: Date.now()
      });

      const res = await resultPromise;
      expect(res.success).toBe(true);
    }
  });
});

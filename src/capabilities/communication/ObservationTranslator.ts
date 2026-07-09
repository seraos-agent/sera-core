import { CommunicationObservation } from './types';
import { StandardEvent } from '../../core/events/types';

/**
 * ObservationTranslator — Universal interface for translating platform-specific
 * events into platform-agnostic StandardEvents.
 * 
 * Each communication platform implements this interface to normalize its raw
 * events into the SERA Observation format. Core never sees raw platform events.
 * 
 * Design Principle:
 * - The translator ONLY normalizes structure. It does NOT classify intent,
 *   summarize content, or perform any cognitive operation.
 * - Filtering (e.g. ignoring bot messages) is allowed here because it is
 *   a sensory concern, not a cognitive one.
 */
export interface ObservationTranslator {
  /**
   * Translate a raw platform event into a CommunicationObservation.
   * Returns null if the event should be filtered out (e.g. bot messages, system noise).
   */
  translate(rawEvent: any): CommunicationObservation | null;

  /**
   * Determine whether this observation should be bridged to DialogueEngine.
   * Returns true for direct messages and @mentions.
   * Returns false for ambient channel messages (observation-only).
   */
  shouldBridgeToDialogue(observation: CommunicationObservation): boolean;
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { EventTypes } from '../src/core/events/types';
import { ProposalManager } from '../src/core/governance/ProposalManager';
import { WhatsAppAdapter } from '../src/capabilities/communication/adapters/WhatsAppAdapter';
import { LanguageInference } from '../src/capabilities/dialogue/LanguageInference';

describe('Proposal Safety & WhatsApp Interactive Buttons', () => {
  let eventBus: EventEmitter;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = new EventEmitter();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ProposalManager 60-Second Auto-Expire TTL', () => {
    it('creates a proposal and auto-expires it after 60,000ms', () => {
      const manager = new ProposalManager(eventBus);
      const expiredSpy = vi.fn();
      const speakSpy = vi.fn();

      eventBus.on(EventTypes.DIALOGUE_PROPOSAL_EXPIRED, expiredSpy);
      eventBus.on(EventTypes.DIALOGUE_AGENT_SPEAK, speakSpy);

      const proposalId = manager.createProposal({
        intent: 'THREADS_DELETE',
        parameters: { postId: '12345' },
        userMessage: 'hapus post ini'
      });

      expect(manager.getProposal(proposalId)).toBeDefined();

      // Fast forward 59 seconds: proposal should still be alive
      vi.advanceTimersByTime(59000);
      expect(manager.getProposal(proposalId)).toBeDefined();
      expect(expiredSpy).not.toHaveBeenCalled();

      // Fast forward another 2 seconds (total 61s): proposal must expire
      vi.advanceTimersByTime(2000);
      expect(manager.getProposal(proposalId)).toBeUndefined();
      expect(expiredSpy).toHaveBeenCalledTimes(1);
      expect(expiredSpy.mock.calls[0][0].payload.proposalId).toBe(proposalId);
      expect(speakSpy).toHaveBeenCalledTimes(1);
      expect(speakSpy.mock.calls[0][0].payload.text).toContain('60 detik');
    });

    it('cancels the TTL timer when proposal is approved', () => {
      const manager = new ProposalManager(eventBus);
      const spawnedSpy = vi.fn();
      const expiredSpy = vi.fn();

      eventBus.on(EventTypes.DOMAIN_GOAL_SPAWNED, spawnedSpy);
      eventBus.on(EventTypes.DIALOGUE_PROPOSAL_EXPIRED, expiredSpy);

      const proposalId = manager.createProposal({
        intent: 'THREADS_DELETE',
        parameters: { postId: '12345' }
      });

      // Approve at 10 seconds
      vi.advanceTimersByTime(10000);
      const success = manager.approveProposal(proposalId);
      expect(success).toBe(true);
      expect(spawnedSpy).toHaveBeenCalledTimes(1);

      // Advance past 60s: expire should NOT be triggered because timer was cleared
      vi.advanceTimersByTime(70000);
      expect(expiredSpy).not.toHaveBeenCalled();
    });

    it('cancels the TTL timer when proposal is rejected', () => {
      const manager = new ProposalManager(eventBus);
      const expiredSpy = vi.fn();

      eventBus.on(EventTypes.DIALOGUE_PROPOSAL_EXPIRED, expiredSpy);

      const proposalId = manager.createProposal({
        intent: 'TRANSFER_FUNDS',
        parameters: { amount: 100 }
      });

      // Reject at 20 seconds
      vi.advanceTimersByTime(20000);
      manager.rejectProposal(proposalId);

      // Advance past 60s
      vi.advanceTimersByTime(70000);
      expect(expiredSpy).not.toHaveBeenCalled();
    });
  });

  describe('WhatsAppAdapter Interactive Button Formatting', () => {
    it('sends interactive button payload with Cancel on the left and Approve on the right', async () => {
      let capturedPayload: any = null;
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
        capturedPayload = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ messages: [{ id: 'wamid.HBgL...' }] })
        };
      }) as any;

      const adapter = new WhatsAppAdapter('test_session', {
        phoneNumberId: '1000123456',
        accessToken: 'mock_token'
      }, eventBus);

      const result = await adapter.sendMessage({
        platform: 'whatsapp',
        channelId: '6285784321952',
        text: 'Postingan Threads (ID: 9988) akan dihapus secara permanen.\n\n⏳ Berlaku 60 detik.',
        richContent: {
          proposal: {
            proposalId: 'prop_abc123',
            intent: 'THREADS_DELETE',
            isIndonesian: true
          }
        }
      });

      expect(result.success).toBe(true);
      expect(capturedPayload).toBeDefined();
      expect(capturedPayload.type).toBe('interactive');
      expect(capturedPayload.interactive.type).toBe('button');
      expect(capturedPayload.interactive.header).toBeUndefined();

      const buttons = capturedPayload.interactive.action.buttons;
      expect(buttons.length).toBe(2);

      // Button 0 (Left): Cancel
      expect(buttons[0].reply.id).toBe('reject_prop_prop_abc123');
      expect(buttons[0].reply.title).toBe('Batal');

      // Button 1 (Right): Confirm Delete
      expect(buttons[1].reply.id).toBe('approve_prop_prop_abc123');
      expect(buttons[1].reply.title).toBe('Hapus');

      global.fetch = originalFetch;
    });

    it('formats English buttons correctly when isIndonesian is false', async () => {
      let capturedPayload: any = null;
      const originalFetch = global.fetch;

      global.fetch = vi.fn().mockImplementation(async (url: any, opts: any) => {
        capturedPayload = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({ messages: [{ id: 'wamid.HBgL...' }] })
        };
      }) as any;

      const adapter = new WhatsAppAdapter('test_session', {
        phoneNumberId: '1000123456',
        accessToken: 'mock_token'
      }, eventBus);

      await adapter.sendMessage({
        platform: 'whatsapp',
        channelId: '6285784321952',
        text: 'Threads post will be permanently deleted.\n\n⏳ Valid for 60 seconds.',
        richContent: {
          proposal: {
            proposalId: 'prop_xyz789',
            intent: 'THREADS_DELETE',
            isIndonesian: false
          }
        }
      });

      expect(capturedPayload.interactive.action.buttons[0].reply.title).toBe('Cancel');
      expect(capturedPayload.interactive.action.buttons[1].reply.title).toBe('Delete');

      global.fetch = originalFetch;
    });
  });

  describe('LanguageInference Safety', () => {
    it('infers Indonesian reliably for deletion requests', () => {
      expect(LanguageInference.infer('Sekarang hapus postingan barusan')).toBe('Indonesian');
      expect(LanguageInference.infer('tolong delete post tadi ya')).toBe('Indonesian');
      expect(LanguageInference.infer('Delete this post now please')).toBe('English');
    });
  });
});

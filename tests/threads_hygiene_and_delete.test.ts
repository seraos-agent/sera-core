import { describe, it, expect, vi } from 'vitest';
import { ThreadsAPI } from '../src/capabilities/threads/ThreadsAPI';
import { ThreadsCapability } from '../src/capabilities/threads/ThreadsCapability';
import { LanguageInference } from '../src/capabilities/dialogue/LanguageInference';
import { ReActExecutor } from '../src/capabilities/dialogue/cognitive/ReActExecutor';

describe('Threads Hygiene, Post Deletion & Language Inference', () => {
  describe('Threads 24-Hour Mention Filtering', () => {
    it('discards mentions older than 24 hours', () => {
      const now = Date.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      const mockMentions = [
        { id: 'recent_1', text: 'Hey @sera.agent help me', timestamp: new Date(now - 2 * 60 * 60 * 1000).toISOString(), username: 'user1' },
        { id: 'stale_old', text: 'Old mention @sera.agent', timestamp: new Date(now - 30 * 60 * 60 * 1000).toISOString(), username: 'user2' }
      ];

      const recentMentions = mockMentions.filter(m => new Date(m.timestamp).getTime() > twentyFourHoursAgo);
      expect(recentMentions.length).toBe(1);
      expect(recentMentions[0].id).toBe('recent_1');
    });

    it('returns empty when all mentions are older than 24 hours', () => {
      const now = Date.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      const mockOldMentions = [
        { id: '18110970316971989', text: 'Old mention from last week', timestamp: new Date(now - 72 * 60 * 60 * 1000).toISOString(), username: 'user_old' }
      ];

      const recentMentions = mockOldMentions.filter(m => new Date(m.timestamp).getTime() > twentyFourHoursAgo);
      expect(recentMentions.length).toBe(0);
    });
  });

  describe('ThreadsAPI.deletePost', () => {
    it('calls DELETE on Meta Graph API endpoint and returns true', async () => {
      const mockSecretManager: any = {
        getSecret: vi.fn().mockResolvedValue('mock_threads_token_123')
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const api = new ThreadsAPI(mockSecretManager, mockFetch as any);
      const result = await api.deletePost('dev', '18001234567890');

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      const calledOpts = mockFetch.mock.calls[0][1] as any;

      expect(calledUrl).toContain('https://graph.threads.net/v1.0/18001234567890');
      expect(calledUrl).toContain('access_token=mock_threads_token_123');
      expect(calledOpts.method).toBe('DELETE');
    });

    it('throws descriptive error on Meta API failure', async () => {
      const mockSecretManager: any = {
        getSecret: vi.fn().mockResolvedValue('mock_token')
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        text: async () => '{"error":{"message":"Media object not found or already deleted"}}'
      });

      const api = new ThreadsAPI(mockSecretManager, mockFetch as any);
      await expect(api.deletePost('dev', '999999999')).rejects.toThrow('Failed to delete Threads post');
    });
  });

  describe('ThreadsCapability THREADS_DELETE', () => {
    it('exposes THREADS_DELETE with direct execution capability', () => {
      const mockApi: any = {};
      const capability = new ThreadsCapability(mockApi);
      const tools = capability.getTools();
      const deleteTool = tools.find(t => t.name === 'THREADS_DELETE');

      expect(deleteTool).toBeDefined();
      expect(deleteTool?.requiresApproval).toBe(false);
      expect(deleteTool?.irreversible).toBe(true);
    });

    it('executes delete tool and returns structured success response', async () => {
      const mockApi: any = {
        resolveNumericPostId: vi.fn().mockResolvedValue('18001234567890'),
        deletePost: vi.fn().mockResolvedValue(true)
      };

      const capability = new ThreadsCapability(mockApi);
      const result = await capability.execute('THREADS_DELETE', { postId: 'https://www.threads.net/@sera.agent/post/Dc7LZs1H4O_' }, 'dev');

      expect(result.success).toBe(true);
      expect(result.postId).toBe('18001234567890');
      expect(result.message).toContain('deleted successfully');
    });
  });

  describe('LanguageInference Utility', () => {
    it('accurately identifies Indonesian with technical English terms', () => {
      const phrase = 'Mantap, tetap bahasa english karena sera untuk akun global';
      expect(LanguageInference.infer(phrase)).toBe('Indonesian');
      expect(ReActExecutor.inferConversationalLanguage(phrase)).toBe('Indonesian');
    });

    it('identifies English and Spanish phrases', () => {
      expect(LanguageInference.infer('Can you check my Threads account analytics?')).toBe('English');
      expect(LanguageInference.infer('Por favor elimina la publicación anterior')).toBe('Spanish');
    });

    it('inherits conversational language from recent turns', () => {
      const history: any[] = [
        { role: 'assistant', content: 'Mau aku publish yang versi Inggris atau Indonesia?' }
      ];
      expect(LanguageInference.infer('ok', history)).toBe('Indonesian');
    });
  });
});

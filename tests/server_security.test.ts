import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuthenticatedSession } from '../src/server/SessionGuard';

describe('Socket session authorization', () => {
  it('blocks unauthenticated socket actions and informs the client', () => {
    const socket = { id: 's1', handshake: { address: '127.0.0.1' }, data: {}, emit: vi.fn() };

    expect(requireAuthenticatedSession(socket, 'test')).toBe(false);
    expect(socket.emit).toHaveBeenCalledWith('auth:error', {
      message: 'Connect a valid wallet before performing this action.',
    });
  });

  it('allows actions only after the login handler marks the session authenticated', () => {
    const socket = { id: 's2', handshake: { address: '127.0.0.1' }, data: { isAuthenticated: true }, emit: vi.fn() };

    expect(requireAuthenticatedSession(socket, 'test')).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });
});

describe('Server environment security', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('disables development-only features in production and honors the CORS allowlist', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('SERA_CORS_ORIGINS', 'https://app.sera.example, https://staging.sera.example');
    const { isAllowedOrigin, serverConfig } = await import('../src/server/config.js');

    expect(serverConfig.allowDevFeatures).toBe(false);
    expect(isAllowedOrigin('https://app.sera.example')).toBe(true);
    expect(isAllowedOrigin('https://unknown.example')).toBe(false);
  });

  it('allows explicit local development features without widening CORS', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SERA_ENABLE_DEV_FEATURES', 'true');
    vi.stubEnv('SERA_CORS_ORIGINS', 'http://localhost:5173');
    const { isAllowedOrigin, serverConfig } = await import('../src/server/config.js');

    expect(serverConfig.allowDevFeatures).toBe(true);
    expect(isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(false);
  });
});

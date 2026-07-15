export interface AuthenticatedSocket {
  data: { isAuthenticated?: boolean };
  emit(event: string, payload: unknown): unknown;
}

/**
 * Boundary guard for every socket operation that reads or mutates an agent
 * session. Authentication is established only by the auth:login handler.
 */
export function requireAuthenticatedSession(socket: AuthenticatedSocket): boolean {
  if (socket.data.isAuthenticated) return true;

  socket.emit('auth:error', {
    message: 'Connect a valid wallet before performing this action.',
  });
  return false;
}

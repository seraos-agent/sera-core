import { EventEmitter } from 'node:events';
import { EventTypes } from '../core/events/types';

export interface AuthenticatedSocket {
  id: string;
  handshake: { address: string };
  data: { isAuthenticated?: boolean; sessionId?: string; personalWalletAddress?: string };
  emit(event: string, payload: unknown): unknown;
}

/**
 * Boundary guard for every socket operation that reads or mutates an agent
 * session. Authentication is established only by the auth:login handler.
 */
export function requireAuthenticatedSession(
  socket: AuthenticatedSocket, 
  actionName: string, 
  eventBus?: EventEmitter
): boolean {
  if (socket.data.isAuthenticated) return true;

  if (eventBus) {
    eventBus.emit(EventTypes.SECURITY_AUTH_FAILURE, {
      action: actionName,
      socketId: socket.id,
      ip: socket.handshake.address,
      timestamp: Date.now()
    });
  }

  socket.emit('auth:error', {
    message: 'Connect a valid wallet before performing this action.',
  });
  return false;
}

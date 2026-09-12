import { SocketSessionContext } from './types';
import { requireAuthenticatedSession } from '../../SessionGuard';
import { StandardEvent, EventTypes } from '../../../core/events/types';
import { DocumentParserService, ParsedDocumentResult } from '../../../core/ingestion/DocumentParserService';

/**
 * Registers real-time chat streaming, multi-modal document ingestion,
 * cognitive observations, proposals, and turn cancellation.
 */
export function registerChatHandlers(context: SocketSessionContext): void {
  const {
    socket,
    getInstance,
    clearSocketObservationBuffer,
    setSessionCognitiveSteps,
    setCurrentTurnStartTime,
  } = context;

  const processChatMessage = async (rawPayload: any) => {
    const instance = getInstance();
    let message = '';
    let clientMessageId: string | undefined = undefined;
    let images: string[] | undefined = undefined;
    let documents: ParsedDocumentResult[] | undefined = undefined;

    if (typeof rawPayload === 'string') {
      message = rawPayload;
    } else if (rawPayload && typeof rawPayload === 'object') {
      message = rawPayload.message || rawPayload.text || '';
      clientMessageId = rawPayload.clientMessageId;
      if (Array.isArray(rawPayload.images) && rawPayload.images.length > 0) {
        images = rawPayload.images;
      } else if (rawPayload.imageUrl) {
        images = [rawPayload.imageUrl];
      }

      if (Array.isArray(rawPayload.documents) && rawPayload.documents.length > 0) {
        const parsedList: ParsedDocumentResult[] = [];
        for (const doc of rawPayload.documents) {
          if (doc.formattedMarkdownTable && doc.detectedType) {
            parsedList.push(doc);
          } else if (doc.content || doc.base64) {
            try {
              const parsed = await DocumentParserService.parseDocument(
                doc.base64 ? Buffer.from(doc.base64, 'base64') : (doc.content || ''),
                doc.name || doc.filename || 'document.csv',
                doc.mimeType || doc.type || 'text/csv'
              );
              parsedList.push(parsed);
            } catch (err: any) {
              console.warn('[ChatSocketHandler] Failed to parse attached document:', err.message);
            }
          }
        }
        if (parsedList.length > 0) documents = parsedList;
      }
    }

    if (!message && (!images || images.length === 0) && (!documents || documents.length === 0)) return;

    clearSocketObservationBuffer();
    setSessionCognitiveSteps([]);
    console.log(`[Server] Received chat:message → dispatching USER_OBSERVATION for ${socket.data.sessionId}`);

    const msgTimestamp = Date.now();
    setCurrentTurnStartTime(msgTimestamp);

    socket.emit('chat:ack', {
      clientMessageId,
      id: msgTimestamp,
      timestamp: msgTimestamp
    });

    const clientTimezone = (typeof rawPayload === 'object' && (rawPayload.timezone || rawPayload.clientTimezone)) ||
                           (typeof socket.handshake.query.timezone === 'string' ? socket.handshake.query.timezone : undefined);

    const event: StandardEvent = {
      id: `evt-${msgTimestamp}`,
      type: EventTypes.DIALOGUE_USER_OBSERVED,
      source: 'SocketServer',
      payload: {
        message,
        images,
        documents,
        ...(clientTimezone ? { responseContext: { platform: 'web_ui', channelId: socket.data.sessionId, timezone: clientTimezone } } : {})
      },
      timestamp: msgTimestamp,
    };

    instance.eventBus.emit(EventTypes.DIALOGUE_USER_OBSERVED, event);

    instance.chatHistoryStore.appendUiMessage({
      id: msgTimestamp,
      clientMessageId,
      role: 'user',
      content: message || (images && images.length > 0 ? '[Image Attached]' : (documents && documents.length > 0 ? '[Document Attached]' : '')),
      images,
      documents
    });
  };

  socket.on('chat:message', async (rawPayload: any) => {
    if (!rawPayload) return;

    if (!socket.data.isAuthenticated) {
      let waited = 0;
      const checkInterval = 150;
      const maxWait = 3000;
      while (!socket.data.isAuthenticated && waited < maxWait) {
        await new Promise(r => setTimeout(r, checkInterval));
        waited += checkInterval;
      }
    }

    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'chat:message', instance?.eventBus)) return;
    await processChatMessage(rawPayload);
  });

  socket.on('chat:clear', () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'chat:clear', instance?.eventBus)) return;
    console.log(`[Server] Clearing chat history for ${socket.data.sessionId}`);
    instance.chatHistoryStore.clear();
    instance.runtime.dialogueEngine.clearHistory();
    socket.emit('chat:history', []);
  });

  socket.on('chat:cancel', () => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'chat:cancel', instance?.eventBus)) return;
    console.log(`[Server] Received chat:cancel → dispatching DIALOGUE_USER_CANCELLED for ${socket.data.sessionId}`);
    socket.emit('chat:activity', null);
    if (socket.data.sessionId && socket.data.sessionId !== 'dev') {
      socket.broadcast.to(`user:${socket.data.sessionId}`).emit('chat:activity', null);
    }
    const event: StandardEvent = {
      id: `evt-${Date.now()}`,
      type: EventTypes.DIALOGUE_USER_CANCELLED,
      source: 'SocketServer',
      payload: {},
      timestamp: Date.now(),
    };
    instance.eventBus.emit(EventTypes.DIALOGUE_USER_CANCELLED, event);
  });

  socket.on('chat:proposal_response', (data: { proposalId: string; action: 'APPROVE' | 'REJECT'; candidateId?: string }) => {
    const instance = getInstance();
    if (!requireAuthenticatedSession(socket, 'chat:proposal_response', instance?.eventBus)) return;
    const { proposalId, action, candidateId } = data;
    console.log(`[Server] Received proposal response for ${proposalId}: ${action} (candidateId: ${candidateId})`);

    const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    instance.chatHistoryStore.updateProposalStatus(proposalId, status);

    if (action === 'APPROVE') {
      instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_APPROVED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_APPROVED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { proposalId, candidateId }
      } as StandardEvent);
    } else {
      instance.eventBus.emit(EventTypes.DIALOGUE_PROPOSAL_REJECTED, {
        id: `evt-${Date.now()}`,
        type: EventTypes.DIALOGUE_PROPOSAL_REJECTED,
        source: 'SocketServer',
        timestamp: Date.now(),
        payload: { proposalId }
      } as StandardEvent);
    }
  });
}

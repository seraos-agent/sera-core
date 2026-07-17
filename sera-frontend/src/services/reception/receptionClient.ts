export type ReceptionVisual =
  | 'introduction'
  | 'capabilities'
  | 'operating'
  | 'ecosystem'
  | 'crypto'
  | 'automation'
  | 'security'
  | 'general'
  | 'start';

export type ReceptionReply = {
  visual: ReceptionVisual;
  label: string;
  response: string;
  suggestedQuestions: string[];
};

export type ReceptionTurn = {
  role: 'user' | 'assistant';
  content: string;
};

const endpoint = import.meta.env.VITE_RECEPTION_API_URL ?? '/api/reception/chat';

function removeReceptionMetadata(response: string): string {
  return response
    .split('\n')
    .filter((line) => !/^[\s>*`]*(?:\*\*|`)?\s*(?:visual|label|suggestedQuestions)\s*(?:\*\*|`)?\s*:/i.test(line))
    .filter((line) => !/^\s*```(?:json)?\s*$/i.test(line))
    .join('\n')
    .trim();
}

function cleanReply(reply: ReceptionReply): ReceptionReply {
  return { ...reply, label: '', response: removeReceptionMetadata(reply.response) };
}

/** Public Reception only. This client never connects to the authenticated Core socket. */
export async function getReceptionReply(message: string, history: ReceptionTurn[] = []): Promise<ReceptionReply> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history: history.slice(-4) }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { error?: string } | null;
      return {
        visual: 'general',
        label: response.status === 429 ? 'RECEPTION BUSY' : 'RECEPTION UNAVAILABLE',
        response: body?.error || 'SERA Reception is temporarily unavailable. Please try again in a moment.',
        suggestedQuestions: [],
      };
    }
    return cleanReply(await response.json() as ReceptionReply);
  } catch {
    return {
      visual: 'general',
      label: 'RECEPTION UNAVAILABLE',
      response: 'SERA Reception is temporarily unavailable. Please try again in a moment.',
      suggestedQuestions: [],
    };
  }
}

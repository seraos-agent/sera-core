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

const endpoint = import.meta.env.VITE_RECEPTION_API_URL ?? '/api/reception/chat';

/** Public Reception only. This client never connects to the authenticated Core socket. */
export async function getReceptionReply(message: string): Promise<ReceptionReply> {
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
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
    return await response.json() as ReceptionReply;
  } catch {
    return {
      visual: 'general',
      label: 'RECEPTION UNAVAILABLE',
      response: 'SERA Reception is temporarily unavailable. Please try again in a moment.',
      suggestedQuestions: [],
    };
  }
}

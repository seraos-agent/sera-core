export class MessageIntakePolicy {
  requiresClarification(message: string): boolean {
    const value = message.trim();
    if (!value) return true;
    const greeting = /^(hi|hello|helo|hei|hey|yo|hai|halo|oke|ok|sip|siap)[.!\s]*$/i;
    if (greeting.test(value)) return false;
    if (value.length <= 2) return true;
    // A standalone opaque token (including a possible code/ticker) has no
    // reliable intent. Clarify rather than pretending to know its meaning.
    return !/\s/.test(value) && /^[\p{L}\p{N}_-]{3,}$/u.test(value);
  }
}

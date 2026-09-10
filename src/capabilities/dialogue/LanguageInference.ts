import { QwenMessage } from '../llm/QwenAdapter';

/**
 * LanguageInference — Infers the user's conversational language from their current message and recent turns.
 *
 * Architecture Role: Dialogue Capability Utility (src/capabilities/dialogue/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard for code and comments).
 * Ensures interim progress updates and proactive replies match the user's natural language.
 */
export class LanguageInference {
  private static readonly INDONESIAN_REGEX = /\b(aku|kamu|saya|dia|kita|kami|mereka|mau|ingin|bisa|tolong|mohon|buatkan|bikin|ubah|ganti|tambah|hapus|tetap|karena|untuk|dengan|dari|ke|di|pada|oleh|bagi|lagi|udah|sudah|belum|akan|sedang|pernah|sempat|yang|ini|itu|sini|situ|sana|mana|siapa|apa|kenapa|bagaimana|ya|yah|nih|dong|kok|deh|kan|loh|lah|tuh|siap|mantap|oke|okee|yoi|sip|noted|nggak|ngga|gak|ga|tidak|bukan|jangan|banget|aja|saja|juga|masih|hanya|cuma|akun|bahasa|posting|postingan|tayang|kelar|beres|jadwal|kirim)\b/i;
  private static readonly SPANISH_REGEX = /\b(hola|por favor|gracias|bueno|hacer|crear|actualizar|cuenta|para|con|este|esta)\b/i;
  private static readonly JAPANESE_CHINESE_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
  private static readonly ARABIC_REGEX = /[\u0600-\u06FF]/;

  /**
   * Infers the primary language of the conversation.
   * Scans the user message and recent conversational history.
   */
  public static infer(userMessage: string, history?: QwenMessage[]): string {
    const textToScan = [
      userMessage,
      ...(history ? history.slice(-4).map(m => typeof m.content === 'string' ? m.content : '') : [])
    ].join(' ');

    if (this.INDONESIAN_REGEX.test(textToScan)) {
      return 'Indonesian';
    }

    if (this.SPANISH_REGEX.test(textToScan)) {
      return 'Spanish';
    }

    if (this.JAPANESE_CHINESE_REGEX.test(textToScan)) {
      return 'Japanese';
    }

    if (this.ARABIC_REGEX.test(textToScan)) {
      return 'Arabic';
    }

    return 'English';
  }
}

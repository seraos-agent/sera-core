/**
 * OutputGroundingGuardrail.ts — Real-time Pre-Send Factual & Action Verification Layer.
 * Architecture Role: Cognitive Guardrail Sub-Component (src/capabilities/dialogue/cognitive/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 *
 * Verifies final LLM response text against actual tool receipts and observations
 * before sending to the user, strictly eliminating fake action completion and fictional lists.
 */

import { ReActExecutor } from './ReActExecutor';

export interface GroundingVerificationContext {
  userMessage: string;
  finalAnswer: string;
  successfulToolResults: Array<{ name: string; output: any }>;
  hadTools: boolean;
}

export interface GroundingVerificationResult {
  passed: boolean;
  sanitizedAnswer: string;
  violations: string[];
}

export class OutputGroundingGuardrail {
  /**
   * Fast heuristic verification of the LLM output against tool reality (<2ms latency budget).
   * Supports bilingual verification (Indonesian & English) across financial, workspace, and omnichannel actions.
   */
  public static verify(ctx: GroundingVerificationContext): GroundingVerificationResult {
    const { finalAnswer, successfulToolResults, hadTools } = ctx;
    const violations: string[] = [];
    let sanitizedAnswer = finalAnswer;

    const toolNames = new Set(successfulToolResults.map(r => r.name));

    // ── Check 1: Financial & DeFi Action Claims (Zero Fake Completion) ────────
    // Transfer funds claim check (ID & EN)
    const idTransferClaim = /(?:sudah|telah|berhasil)\s+(?:saya\s+)?(?:transfer|kirimkan\s+(?:dana|usdc|token)|mengirim\s+(?:dana|usdc|token))|transaksi\s+berhasil\s+dikirim/i;
    const enTransferClaim = /(?:(?:have|has|already|successfully)\s+)*(?:transferred|sent)\s+(?:the\s+)?(?:\d+[\w.]*\s+)?(?:funds|usdc|tokens?)|transaction\s+(?:has\s+been|was)\s+(?:successfully\s+)?(?:sent|submitted|mined)/i;

    if ((idTransferClaim.test(finalAnswer) || enTransferClaim.test(finalAnswer)) && !toolNames.has('TRANSFER_FUNDS')) {
      violations.push('UNGROUNDED_TRANSFER_CLAIM');
      if (idTransferClaim.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(
          idTransferClaim,
          'belum ditransfer (memerlukan persetujuan dan eksekusi resmi)'
        );
      }
      if (enTransferClaim.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(
          enTransferClaim,
          'has not been transferred (requires explicit user confirmation and execution)'
        );
      }
    }

    // Token Swap claim check (ID & EN)
    const idSwapClaim = /(?:sudah|telah|berhasil)\s+(?:melakukan\s+)?swap\s+token|token\s+berhasil\s+ditukar/i;
    const enSwapClaim = /(?:have|successfully|already)\s+swapped\s+(?:the\s+)?tokens?|token\s+swap\s+(?:has\s+been|was)\s+completed/i;

    if ((idSwapClaim.test(finalAnswer) || enSwapClaim.test(finalAnswer)) && !toolNames.has('SWAP_TOKENS')) {
      violations.push('UNGROUNDED_SWAP_CLAIM');
      if (idSwapClaim.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(idSwapClaim, 'swap token belum dieksekusi');
      }
      if (enSwapClaim.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(enSwapClaim, 'token swap has not been executed');
      }
    }

    // ── Check 2: Workspace & Storage Action Claims ────────────────────────────
    // Google Sheets creation claim check (ID & EN)
    const idSheetsClaim = /(?:spreadsheet|lembar\s+kerja)\s+(?:telah|sudah)\s+berhasil\s+dibuat/i;
    const enSheetsClaim = /(?:spreadsheet|google\s+sheet)\s+(?:has\s+been|was)\s+successfully\s+created/i;

    if ((idSheetsClaim.test(finalAnswer) || enSheetsClaim.test(finalAnswer)) && !toolNames.has('GDRIVE_CREATE_SPREADSHEET')) {
      violations.push('UNGROUNDED_SPREADSHEET_CLAIM');
      if (idSheetsClaim.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(
          idSheetsClaim,
          'belum dibuat di Google Drive'
        );
      }
      if (enSheetsClaim.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(
          enSheetsClaim,
          'has not been created in Google Drive'
        );
      }
    }

    // Email dispatch claim check (ID & EN)
    const idEmailClaim = /(?:email|surel)\s+(?:telah|sudah)\s+berhasil\s+dikirim|berhasil\s+mengirimkan\s+email/i;
    const enEmailClaim = /(?:email|message)\s+(?:has\s+been|was)\s+successfully\s+sent|have\s+sent\s+(?:the\s+)?email/i;

    if ((idEmailClaim.test(finalAnswer) || enEmailClaim.test(finalAnswer)) &&
        !toolNames.has('RESEND_SEND_EMAIL') && !toolNames.has('SEND_EMAIL')) {
      violations.push('UNGROUNDED_EMAIL_CLAIM');
      if (idEmailClaim.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(idEmailClaim, 'email belum dikirim');
      }
      if (enEmailClaim.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(enEmailClaim, 'email has not been sent');
      }
    }

    // ── Check 3: Omnichannel & Social Publishing Action Claims ────────────────
    // Threads publishing claim check (ID & EN)
    const idThreadsPublishRegex = /(?:postingan|utas|thread)\s+(?:telah|sudah)\s+berhasil\s+(?:diunggah|diposting)|berhasil\s+diposting\s+ke\s+threads/i;
    const enThreadsPublishRegex = /(?:thread|post)\s+(?:has\s+been|was)\s+successfully\s+(?:published|posted)\s+(?:to|on)\s+threads/i;

    if ((idThreadsPublishRegex.test(finalAnswer) || enThreadsPublishRegex.test(finalAnswer)) && !toolNames.has('THREADS_PUBLISH')) {
      violations.push('UNGROUNDED_THREADS_PUBLISH_CLAIM');
      if (idThreadsPublishRegex.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(
          idThreadsPublishRegex,
          'belum diunggah ke Threads'
        );
      }
      if (enThreadsPublishRegex.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(
          enThreadsPublishRegex,
          'has not been posted to Threads'
        );
      }
    }

    // Twitter / X publishing claim check (ID & EN)
    const idTwitterPublishRegex = /(?:tweet|postingan\s+twitter|postingan\s+x)\s+(?:telah|sudah)\s+berhasil\s+(?:diunggah|diposting)/i;
    const enTwitterPublishRegex = /(?:tweet|post\s+on\s+x)\s+(?:has\s+been|was)\s+successfully\s+(?:posted|published)/i;

    if ((idTwitterPublishRegex.test(finalAnswer) || enTwitterPublishRegex.test(finalAnswer)) && !toolNames.has('TWITTER_POST')) {
      violations.push('UNGROUNDED_TWITTER_POST_CLAIM');
      if (idTwitterPublishRegex.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(idTwitterPublishRegex, 'tweet belum diunggah ke Twitter/X');
      }
      if (enTwitterPublishRegex.test(sanitizedAnswer)) {
        sanitizedAnswer = sanitizedAnswer.replace(enTwitterPublishRegex, 'tweet has not been posted to Twitter/X');
      }
    }

    // ── Check 4: Empty Observation Fictional Fabrication Check ────────────────
    for (const toolRes of successfulToolResults) {
      if (toolRes.name === 'THREADS_GET_POSTS' && ReActExecutor.isEmptySensoryPayload(toolRes.name, toolRes.output)) {
        const idFabricatesPosts = /(?:berikut\s+(?:adalah\s+)?(?:beberapa\s+)?(?:postingan|utas)|postingan\s+terbaru\s+anda)(?::)?\s*[\r\n]+\s*(?:[-*•]|\d+\.)/i;
        const enFabricatesPosts = /(?:here\s+are\s+(?:your\s+)?(?:latest\s+)?(?:posts|threads)|your\s+recent\s+threads)(?::)?\s*[\r\n]+\s*(?:[-*•]|\d+\.)/i;

        if (idFabricatesPosts.test(sanitizedAnswer)) {
          violations.push('FABRICATED_EMPTY_THREADS_POSTS');
          sanitizedAnswer = 'Saya telah memeriksa akun Threads Anda, namun saat ini belum ada postingan terbaru yang ditemukan.';
          break;
        } else if (enFabricatesPosts.test(sanitizedAnswer)) {
          violations.push('FABRICATED_EMPTY_THREADS_POSTS');
          sanitizedAnswer = 'I have checked your Threads account, but no recent posts were found at this time.';
          break;
        }
      }

      if (toolRes.name === 'CATALOG_SEARCH_PRODUCTS' && ReActExecutor.isEmptySensoryPayload(toolRes.name, toolRes.output)) {
        const idFabricatesProducts = /(?:berikut\s+(?:adalah\s+)?(?:beberapa\s+)?produk|produk\s+yang\s+tersedia)(?::)?\s*[\r\n]+\s*(?:[-*•]|\d+\.)/i;
        const enFabricatesProducts = /(?:here\s+are\s+(?:the\s+)?available\s+products|matching\s+products)(?::)?\s*[\r\n]+\s*(?:[-*•]|\d+\.)/i;

        if (idFabricatesProducts.test(sanitizedAnswer)) {
          violations.push('FABRICATED_EMPTY_CATALOG_PRODUCTS');
          sanitizedAnswer = 'Saya telah memeriksa katalog toko, namun produk yang dicari saat ini belum tersedia.';
          break;
        } else if (enFabricatesProducts.test(sanitizedAnswer)) {
          violations.push('FABRICATED_EMPTY_CATALOG_PRODUCTS');
          sanitizedAnswer = 'I checked the catalog, but the requested products are currently not available.';
          break;
        }
      }
    }

    // ── Check 5: Epistemic Boundary on Unauthorized Private Data ──────────────
    // When user asks for private personal messages or inbox and no sensor tool ran
    const idPrivateAccess = /(?:saya\s+telah\s+(?:membaca|memeriksa|melihat)\s+(?:inbox|pesan\s+pribadi|dm|rahasia|password|ktp)\s+anda)/i;
    const enPrivateAccess = /(?:i\s+have\s+(?:read|checked|inspected|accessed)\s+your\s+private\s+(?:inbox|messages|dms|passwords?|credentials?))/i;

    if (!hadTools && (idPrivateAccess.test(finalAnswer) || enPrivateAccess.test(finalAnswer))) {
      violations.push('UNGROUNDED_PRIVATE_DATA_ACCESS');
      if (idPrivateAccess.test(sanitizedAnswer)) {
        sanitizedAnswer = 'Saya tidak memiliki akses langsung ke pesan atau data pribadi Anda tanpa integrasi dan otorisasi resmi.';
      } else {
        sanitizedAnswer = 'I do not have direct access to your private messages or personal credentials without explicit authorization.';
      }
    }

    return {
      passed: violations.length === 0,
      sanitizedAnswer,
      violations
    };
  }
}


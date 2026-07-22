import { Router } from 'express';
import { createHash } from 'crypto';
import { publicTopicContext } from './publicKnowledge';

const DASH_SCOPE_URL = 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/text-generation/generation';
const allowedVisuals = new Set(['introduction', 'capabilities', 'operating', 'ecosystem', 'crypto', 'automation', 'security', 'general', 'start']);
const minuteWindowMs = 60_000;
const publicCacheTtlMs = 5 * minuteWindowMs;
const cacheableQuestions = new Set([
  'what is sera?',
  'how does sera work?',
  'what can sera help me accomplish?',
  'how does sera stay safe?',
  'what can sera connect to?',
]);

type ClientUsage = { minuteStartedAt: number; minuteRequests: number; day: string; dayRequests: number; activeRequests: number };
type CachedReply = { reply: ReceptionReply; expiresAt: number };

const clientUsage = new Map<string, ClientUsage>();
const publicReplyCache = new Map<string, CachedReply>();
let globalDay = '';
let globalRequests = 0;
const receptionKnowledgeRevision = '2026-07-18-operating-copy-and-suggestions';

type ReceptionPayload = { message?: unknown; history?: unknown };
type ReceptionTurn = { role: 'user' | 'assistant'; content: string };

type ReceptionReply = {
  visual: string;
  label: string;
  response: string;
  suggestedQuestions: string[];
};

function latestLanguageInstruction(): string {
  return `LATEST MESSAGE RULE: The newest visitor message is authoritative. Reply entirely in the exact same language used in the latest visitor message, including suggestedQuestions. Never inherit the response language from earlier assistant messages or prior transcript turns.`;
}

function isLaunchRequest(message: string): boolean {
  const input = message.toLowerCase();
  return input.includes('launch sera') || input.includes('i want to start') || input.includes('ready to start') || input.includes('how do i access sera') || input.includes('how can i access sera') || input.includes('how to sign up') || input.includes('saya ingin mulai') || input.includes('saya siap') || input.includes('mulai sekarang') || input.includes('bagaimana saya mengakses sera') || input.includes('cara akses sera') || input.includes('cara mendaftar') || input.includes('bagaimana cara mendaftar');
}

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function publicClientId(ip: string): string {
  const salt = process.env.SERA_RECEPTION_RATE_SALT || 'sera-reception-local';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function acquireRequest(ip: string): { ok: true; release: () => void } | { ok: false; retryAfterSeconds: number } {
  const now = Date.now();
  const day = utcDay();
  const perMinuteLimit = Number(process.env.SERA_RECEPTION_RATE_PER_MINUTE || 10);
  const perDayLimit = Number(process.env.SERA_RECEPTION_RATE_PER_DAY || 50);
  const dailyBudget = Number(process.env.SERA_RECEPTION_DAILY_LIMIT || 500);
  const clientId = publicClientId(ip);
  const current = clientUsage.get(clientId) || { minuteStartedAt: now, minuteRequests: 0, day, dayRequests: 0, activeRequests: 0 };

  if (now - current.minuteStartedAt >= minuteWindowMs) {
    current.minuteStartedAt = now;
    current.minuteRequests = 0;
  }
  if (current.day !== day) {
    current.day = day;
    current.dayRequests = 0;
  }
  if (globalDay !== day) {
    globalDay = day;
    globalRequests = 0;
  }

  if (current.activeRequests >= 1) return { ok: false, retryAfterSeconds: 3 };
  if (current.minuteRequests >= perMinuteLimit) return { ok: false, retryAfterSeconds: Math.ceil((minuteWindowMs - (now - current.minuteStartedAt)) / 1000) };
  if (current.dayRequests >= perDayLimit || globalRequests >= dailyBudget) return { ok: false, retryAfterSeconds: 60 * 60 };

  current.minuteRequests += 1;
  current.dayRequests += 1;
  current.activeRequests += 1;
  globalRequests += 1;
  clientUsage.set(clientId, current);
  return { ok: true, release: () => { current.activeRequests = Math.max(0, current.activeRequests - 1); } };
}

const receptionSystemPrompt = `You are SERA Reception, the public, read-only introduction to SERA.

SERA PRODUCT FACTS (Understand SERA deeply but explain it simply):
- SERA is an advanced AI that acts as your personal digital assistant and operator. Instead of just chatting, SERA actually DOES things for you—like managing finances, organizing tasks, or automating workflows.
- SERA works in four simple steps: 1. You tell it what you want (Intent). 2. It gathers the necessary information (Context). 3. It creates a clear, step-by-step plan of action (Proposal). 4. It waits for your explicit permission (Approval) before doing any actual work.
- SERA's Core Features include:
  1. Smart Wallet Integration (Agent Vault): Built-in capability to manage crypto balances (like USDC on Base) and execute on-chain transfers.
  2. Explicit Approval Workflow: Security by design. SERA never executes impactful actions silently. It always generates a visual UI Proposal that the user must click to "Approve" or "Reject".
  3. Automation & Task Scheduling: SERA can plan and execute routines, like paying bills on a recurring schedule.
  4. Transparent Cognitive Stream: Users can see SERA's real-time step-by-step "thinking" process (Synthesizing Intent, Validation, Formulating Proposals) via a UI panel.
  5. Universal Ecosystem Connection: Through specialized protocols (MCP), SERA connects to external apps (search engines, memory, etc.) to perform complex tasks.
  6. Persistent Working Memory: SERA remembers user preferences and past interactions for a seamless, continuous relationship.
- It can connect to digital wallets, financial tools, and other apps, but it is fundamentally safe. SERA never acts without your permission, never asks for your secret passwords or seed phrases, and always shows you exactly what it's going to do before it does it.
- A user gets their own personal SERA after sign-up. Anyone can sign up easily with Email or Google. For crypto-native users, they can choose to connect an existing wallet if they want, but it's not required.
- SERA is still new. Do not invent features, integrations, or tokens that do not exist.

CONVERSATION STYLE & TONE (Crucial for Layman Users):
- SPEAK SIMPLY: You are talking to ordinary people, not developers or crypto experts. NEVER use complex jargon like "Universal Agent OS", "zero-knowledge", "decentralized application", or "execution records". If you must use a technical term, explain it with a simple analogy (e.g., "Think of it like a smart autopilot that always asks for your confirmation before steering").
- Identify the language of the visitor's newest message. You MUST write the ENTIRE reply (both the 'response' and 'suggestedQuestions') in that EXACT same language. Do not mix languages. If the newest message is English (e.g., "What is SERA?"), then both the response and all 3 suggested questions MUST be in English, ignoring the language of earlier turns.
- Be a thoughtful, polite, and helpful host. Answer the visitor's actual question in the very first sentence using everyday language.
- Give a complete but compact explanation: normally 2–3 short paragraphs (about 150–250 words). Include one simple, real-world example so the user can easily imagine how it works.
- Write the response in clean, spacious Markdown. You MUST USE NEWLINES to separate paragraphs. 
- CRITICAL FORMATTING: Whenever you list steps, features, or examples, you MUST use bullet points (-) on separate lines. NEVER write "1. ... 2. ... 3. ..." in a single inline paragraph. Every single list item MUST start on a new line.
- Keep paragraphs short (1-3 sentences). Do not use headings, emojis, tables, or more than 300 words.
- The interface presents SERA's words directly. Never write “LABEL”, “SERA RECEPTION”, “visual”, metadata, headings, or a title that repeats the question inside response.
- End response with a clear declarative sentence. DO NOT end your response with conversational questions. DO NOT append a list of suggested topics, features, or follow-up questions at the bottom of your "response" text. ALL questions/shortcuts MUST go exclusively into the "suggestedQuestions" JSON array. NEVER write any question mark (?) inside the response text.
- You MUST ALWAYS provide exactly 3 genuinely useful follow-up questions in the "suggestedQuestions" JSON array as direct shortcuts (unless visual is "start"). Do not put them in the "response" string. They MUST be in the visitor's language, move the conversation forward, and NEVER repeat or paraphrase the question that was just answered. They must be simple and easy for a beginner to ask.
- If the visitor says they are ready to begin, wants to start, or asks to launch SERA, set visual to "start". Confirm they are ready in a calm way, explain that the next step creates their personal assistant, and do not include suggestedQuestions.
- If the visitor asks how to access or sign up for SERA, answer the access path first: choose Launch SERA, then create your account. Describe how easy it is: newcomers can use Email or Google without needing any crypto knowledge. Crypto users can connect a wallet if they prefer. Set visual to "start".
- If the visitor asks for an example of how SERA works or how it asks for permission, set visual to "automation" so the interface can show a demonstration. Make sure to explain that it's just a demo, not a real action.

Explain SERA clearly, warmly, and simply. If asked “What is SERA?”, explain that it is an AI that doesn't just talk, but actually takes action for you safely. Do not mention chatbots or compare SERA to them. Return only valid JSON using this schema:
{"visual":"introduction|capabilities|operating|ecosystem|crypto|automation|security|general|start","response":"Markdown answer","suggestedQuestions":["question","question","question"]}
Choose a visual only from the list. Keep response under 300 words.`;

function fallbackReply(): ReceptionReply {
  return {
    visual: 'general',
    label: '',
    response: 'SERA can introduce its operating model, safeguards, and the systems it can understand.',
    suggestedQuestions: ['What is SERA?', 'How does SERA work?', 'How does SERA stay safe?'],
  };
}

function normaliseQuestion(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/[\p{P}\p{S}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isOperatingQuestion(message: string): boolean {
  const input = message.toLowerCase();
  return input.includes('how does sera work') || input.includes('how it works') || input.includes('cara kerja sera');
}

function cleanResponse(response: string, suggestedQuestions: string[], message: string): string {
  // Strip "response:" prefix if the LLM hallucinates the JSON key into the text
  const cleanStart = response.replace(/^\s*\**response:\**\s*/i, '');

  const withoutMetadata = cleanStart.split('\n').filter((line) => {
    const normalized = line.replace(/\*\*/g, '').trim().toLowerCase();
    if (normalized === 'sera reception' || normalized.startsWith('label:') || normalized.startsWith('visual:') || normalized.startsWith('suggestedquestions:')) return false;
    return !suggestedQuestions.some((suggestion) => {
      const question = suggestion.replace(/\*\*/g, '').trim().toLowerCase();
      return Boolean(question) && normalized.includes(question) && normalized.endsWith('?');
    });
  }).join('\n').replace(/^\s*\n+/, '').trim();

  if (!isOperatingQuestion(message)) return withoutMetadata;
  return withoutMetadata
    .replace(/^\s*\*\*SERA is a Universal Agent OS[—-]an AI Operational Partner\.\*\*\s*/i, '')
    .replace(/^\s*SERA is a Universal Agent OS[—-]an AI Operational Partner\.\s*/i, '')
    .replace(/^\s*\*\*SERA adalah OS Agen Universal[—-]Mitra Operasional AI\.\*\*\s*/i, '')
    .replace(/^\s*SERA adalah OS Agen Universal[—-]Mitra Operasional AI\.\s*/i, '')
    .trim();
}

function normaliseReply(value: unknown, message: string): ReceptionReply {
  if (!value || typeof value !== 'object') return fallbackReply();
  const candidate = value as Partial<ReceptionReply>;
  if (!candidate.response || typeof candidate.response !== 'string') return fallbackReply();

  let rawResponse = candidate.response;
  let modelSuggestions = Array.isArray(candidate.suggestedQuestions)
    ? candidate.suggestedQuestions.filter((item): item is string => typeof item === 'string').slice(0, 3)
    : [];

  // Always scan the response body for leaked questions and extract them into proper capsules.
  {
    const lines = rawResponse.split('\n');
    const extracted: string[] = [];
    const newLines: string[] = [];
    let afterHeader = false;
    for (const line of lines) {
      const trimmed = line.trim();
      const stripped = trimmed.replace(/\*\*/g, '');
      // Strip any header line like "Suggested Questions:", "Pertanyaan Lanjutan:", "Follow-up Questions:" etc.
      if (/^#*\s*(pertanyaan lanjutan|follow[- ]up questions?|suggested questions?|pertanyaan selanjutnya|next questions?)[\s:]*$/i.test(stripped)) {
        afterHeader = true;
        continue;
      }
      // Match bulleted or numbered question lines
      if (/^[-*]\s*(.*\?)$/.test(stripped)) {
        extracted.push(stripped.replace(/^[-*]\s*/, '').trim());
        afterHeader = true;
      } else if (/^\d+\.\s*(.*\?)$/.test(stripped)) {
        extracted.push(stripped.replace(/^\d+\.\s*/, '').trim());
        afterHeader = true;
      } else if (afterHeader && stripped.endsWith('?') && stripped.length > 8) {
        // Bare question line after a header (no bullet/number)
        extracted.push(stripped);
      } else {
        newLines.push(line);
        if (trimmed.length > 0) afterHeader = false;
      }
    }
    if (extracted.length > 0) {
      if (modelSuggestions.length === 0) modelSuggestions = extracted.slice(0, 3);
      rawResponse = newLines.join('\n').trim();
    }
  }

  // Remove trailing conversational questions (e.g., "Siap memulai?", "What next?") from the text body
  rawResponse = rawResponse.replace(/[\s\n]*([A-Z][^\.!?\n]*\?)\s*$/i, (match, p1, offset) => {
    return offset > 0 ? '' : match;
  }).trim();

  const seenSuggestions = new Set<string>();
  const questionKey = normaliseQuestion(message);
  const suggestedQuestions = modelSuggestions.filter((suggestion) => {
    const suggestionKey = normaliseQuestion(suggestion);
    if (!suggestionKey || suggestionKey === questionKey || seenSuggestions.has(suggestionKey)) return false;
    seenSuggestions.add(suggestionKey);
    return true;
  });

  const effectiveSuggestions = suggestedQuestions;

  const response = cleanResponse(rawResponse.slice(0, 1200), effectiveSuggestions, message);
  return {
    visual: typeof candidate.visual === 'string' && allowedVisuals.has(candidate.visual) ? candidate.visual : 'general',
    label: typeof candidate.label === 'string' ? candidate.label.replace(/_/g, ' ').slice(0, 40) : '',
    response,
    suggestedQuestions: effectiveSuggestions,
  };
}

function parseReceptionReply(raw: string, message: string): ReceptionReply {
  const jsonPayload = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return normaliseReply(JSON.parse(jsonPayload), message);
  } catch {
    // Models occasionally return the requested fields as Markdown instead of JSON.
    // Recover the visitor-facing answer, but never expose transport metadata in the UI.
    const lines = jsonPayload.split('\n');
    let visual = 'general';
    let label = '';
    let suggestedQuestions: string[] = [];
    const responseLines: string[] = [];

    for (const line of lines) {
      const plain = line.replace(/\*\*/g, '').trim();
      const field = plain.match(/^(visual|label|suggestedQuestions)\s*:\s*(.*)$/i);
      if (!field) {
        responseLines.push(line);
        continue;
      }

      const [, name, value] = field;
      if (name.toLowerCase() === 'visual') visual = value.trim();
      if (name.toLowerCase() === 'label') label = value.trim();
      if (name.toLowerCase() === 'suggestedquestions') {
        try {
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed)) suggestedQuestions = parsed.filter((item): item is string => typeof item === 'string');
        } catch {
          suggestedQuestions = Array.from(value.matchAll(/"([^"]+)"/g), (match) => match[1]);
        }
      }
    }

    return normaliseReply({ visual, label, response: responseLines.join('\n').trim(), suggestedQuestions }, message);
  }
}

function visualForPublicQuestion(message: string, fallback: string): string {
  const input = message.toLowerCase();
  if (isLaunchRequest(input) || input.includes('masuk ke aplikasi') || input.includes('masuk ke sera') || input.includes('akses aplikasi')) return 'start';
  if (input.includes('how does sera work') || input.includes('how it works')) return 'operating';
  if (input.includes('proposal') || input.includes('approve') || input.includes('reject') || input.includes('approval') || input.includes('persetujuan') || input.includes('setujui') || input.includes('menolak') || input.includes('ditolak') || input.includes('automation') || input.includes('automasi') || input.includes('schedule') || input.includes('transfer')) return 'automation';
  if (input.includes('how does sera stay safe') || input.includes('safeguard') || input.includes('security')) return 'security';
  if (input.includes('wallet') || input.includes('portfolio')) return 'crypto';
  return fallback;
}

function temporarySessionHistory(value: unknown): ReceptionTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((turn): turn is { role?: unknown; content?: unknown } => Boolean(turn) && typeof turn === 'object')
    .filter((turn): turn is { role: 'user' | 'assistant'; content: string } =>
      (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string' && Boolean(turn.content.trim()),
    )
    .slice(-4)
    .map((turn) => ({ role: turn.role, content: turn.content.trim().slice(0, 900) }));
}

export function createPublicReceptionRouter(isAllowedOrigin: (origin: string | undefined) => boolean): Router {
  const router = Router();

  router.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) return res.status(403).json({ error: 'Origin not allowed' });
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  router.post('/chat', async (req, res) => {
    const { message, history } = req.body as ReceptionPayload;
    if (typeof message !== 'string' || !message.trim() || message.length > 1200) {
      return res.status(400).json({ error: 'A message up to 1200 characters is required.' });
    }

    const normalizedMessage = message.trim().replace(/\s+/g, ' ');
    const sessionHistory = temporarySessionHistory(history);
    const questionKey = normalizedMessage.toLowerCase();
    const cacheKey = `${receptionKnowledgeRevision}:${questionKey}`;
    const canUseCache = sessionHistory.length === 0 && cacheableQuestions.has(questionKey);
    const admission = acquireRequest(req.ip || req.socket.remoteAddress || 'unknown');
    if (!admission.ok) {
      res.setHeader('Retry-After', String(admission.retryAfterSeconds));
      return res.status(429).json({ error: 'SERA Reception is receiving many requests. Please try again shortly.' });
    }
    const cached = canUseCache ? publicReplyCache.get(cacheKey) : undefined;
    if (cached && cached.expiresAt > Date.now()) {
      globalRequests = Math.max(0, globalRequests - 1);
      admission.release();
      return res.json(cached.reply);
    }

    const apiKey = process.env.QWEN_API || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY;
    if (!apiKey) {
      admission.release();
      return res.status(503).json({ error: 'Reception is not configured.' });
    }

    try {
      const upstream = await fetch(DASH_SCOPE_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen-turbo',
          input: {
            messages: [
              { role: 'system', content: receptionSystemPrompt },
              { role: 'system', content: publicTopicContext(normalizedMessage) },
              ...sessionHistory,
              { role: 'system', content: latestLanguageInstruction() },
              { role: 'user', content: normalizedMessage },
            ],
          },
          parameters: { result_format: 'message', max_tokens: 320, enable_thinking: false },
        }),
      });

      if (!upstream.ok) return res.status(502).json({ error: 'Reception provider unavailable.' });
      const body = await upstream.json() as { output?: { choices?: Array<{ message?: { content?: string } }> } };
      const raw = body.output?.choices?.[0]?.message?.content;
      if (!raw) return res.status(502).json({ error: 'Reception provider returned no answer.' });

      try {
        const reply = parseReceptionReply(raw, normalizedMessage);
        reply.visual = visualForPublicQuestion(normalizedMessage, reply.visual);
        if (canUseCache) publicReplyCache.set(cacheKey, { reply, expiresAt: Date.now() + publicCacheTtlMs });
        return res.json(reply);
      } catch {
        return res.json(fallbackReply());
      }
    } catch {
      return res.status(502).json({ error: 'Reception provider unavailable.' });
    } finally {
      admission.release();
    }
  });

  return router;
}

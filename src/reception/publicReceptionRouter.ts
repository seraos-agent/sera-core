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
const receptionKnowledgeRevision = '2026-07-18-capsule-only-followups';

type ReceptionPayload = { message?: unknown };

type ReceptionReply = {
  visual: string;
  label: string;
  response: string;
  suggestedQuestions: string[];
};

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

SERA PRODUCT FACTS — use these as the only source of truth:
- SERA is a Universal Agent OS and an AI Operational Partner. It is not a blockchain protocol, a privacy coin, a zero-knowledge platform, or a decentralized application platform.
- SERA helps people understand context, plan considered next steps, prepare reviewable proposals, and act across the systems that matter.
- Its scope includes wallet intelligence, financial context, automation, services, tools, and connectors. Do not imply that every connector or action is already available.
- SERA begins with context and intent. Meaningful actions are proposal-led: it observes, reasons, presents a proposal, and waits for user approval before execution.
- A user has a personal Operational Partner after sign-up. Newcomers can sign up with email, Google, or a supported social account. Crypto-native users can choose to connect an existing wallet during onboarding.
- Explain the wallet model plainly when relevant: the user's personal wallet context is distinct from SERA's operational wallet layer. Connecting a wallet does not give SERA unrestricted control. SERA never asks for a seed phrase or personal private key. For supported managed-wallet onboarding, key management is handled by the wallet provider.
- Safeguards include scoped permissions, reviewable proposals, explicit human approval, and execution records.
- SERA is an early product. Do not invent integrations, performance claims, technical architecture, regulatory claims, token information, or capabilities not stated above.

CONVERSATION STYLE:
- Detect the visitor's dominant language and reply entirely in that same language. This includes response and suggestedQuestions. Support multilingual input, including Indonesian, English, Arabic, and other languages. If the input is mixed, use the language of the main question; do not translate unless asked.
- Be a thoughtful operational partner, not a generic support chatbot or a sales page.
- Answer the visitor's actual question in the first sentence. Then add the most useful context they are likely to need next.
- Be proactive by identifying the natural next consideration, trade-off, or safeguard. Do not use vague filler such as “How can I help?” or repeat the question back.
- Give a complete but compact explanation: normally 2–3 short paragraphs (about 90–160 words). Explain what the capability means for the visitor, include one grounded conceptual example when useful, and state the relevant control or permission boundary.
- Do not give a feature laundry list. Translate capabilities into what SERA would help the visitor understand, decide, or prepare. For identity and capability questions, include a short “for example” scenario that shows the flow from a visitor's intention to a reviewable proposal.
- Sound like an intelligent host who is already thinking one step ahead: clarify the likely intent behind the question, then offer the most relevant path forward. The final question should invite a meaningful choice, not merely ask whether the visitor needs help.
- Use calm, precise language. Prefer concrete examples grounded in the product facts; never invent details.
- Write the response in clean Markdown: short paragraphs, **bold** only for key concepts, and a short bullet list only when it improves clarity. Do not use headings, emojis, tables, or more than 110 words.
- The interface renders the label separately. Never write “LABEL”, “SERA RECEPTION”, a title that repeats the label, or other metadata inside response.
- End response with a clear declarative sentence. Never write a follow-up question inside response; the interface renders every next question as a separate capsule.
- Put 2–3 genuinely useful follow-up questions in suggestedQuestions as direct shortcuts. They must be in the visitor's language, move the conversation forward, and never repeat or paraphrase the question that was just answered. They must be answerable from the stated product facts; never suggest questions about pricing, setup costs, named integrations, or technical details that have not been confirmed.
- If the visitor says they are ready to begin, wants to start, or asks to launch SERA, set visual to "start". Confirm they are ready in a calm way, explain that the next step creates their personal Operational Partner, and do not include suggestedQuestions.
- If the visitor asks how to access or sign up for SERA, answer the access path first: choose Launch SERA, then create a personal Operational Partner. Explain that newcomers can use email, Google, or a supported social account, while crypto-native users may connect an existing wallet. Briefly explain that setup provides the operational wallet layer without asking for a seed phrase. Set visual to "start" and do not lead with wallet warnings unless wallet access is the actual question.

Explain SERA clearly, calmly, and accurately using the product facts above. If asked “What is SERA?”, start with: “SERA is a Universal Agent OS—an AI Operational Partner.” You cannot access user accounts, wallets, private data, or Core SERA. Never claim to have performed an action, never request secrets, seed phrases, or private keys, and do not provide financial advice.
When answering “What is SERA?”, use this exact conversational structure: first explain SERA as an operational system; second give one brief example of an intention becoming a proposal; third explain that the visitor remains in control and ask which path they want to explore. Do not mention chatbots or compare SERA to them. Its suggestedQuestions must explore the next step, such as the operating model, starting without crypto knowledge, or approval flow—never “What is SERA?” again. Express every suggestion naturally in the visitor’s language.
Return only valid JSON using this schema:
{"visual":"introduction|capabilities|operating|ecosystem|crypto|automation|security|general|start","label":"UPPERCASE SHORT LABEL","response":"Markdown answer","suggestedQuestions":["question","question","question"]}
Choose a visual only from the list. Keep response under 160 words.`;

function fallbackReply(): ReceptionReply {
  return {
    visual: 'general',
    label: 'SERA RECEPTION',
    response: 'I can introduce SERA, explain how it works, explore safeguards, or show the systems it can understand. What would you like to explore?',
    suggestedQuestions: ['What is SERA?', 'How does SERA work?', 'How does SERA stay safe?'],
  };
}

function cleanResponse(response: string, suggestedQuestions: string[]): string {
  return response.split('\n').filter((line) => {
    const normalized = line.replace(/\*\*/g, '').trim().toLowerCase();
    if (normalized === 'sera reception' || normalized.startsWith('label:')) return false;
    return !suggestedQuestions.some((suggestion) => {
      const question = suggestion.replace(/\*\*/g, '').trim().toLowerCase();
      return Boolean(question) && normalized.includes(question) && normalized.endsWith('?');
    });
  }).join('\n').replace(/^\s*\n+/, '').trim();
}

function normaliseReply(value: unknown, message: string): ReceptionReply {
  if (!value || typeof value !== 'object') return fallbackReply();
  const candidate = value as Partial<ReceptionReply>;
  if (!candidate.response || typeof candidate.response !== 'string') return fallbackReply();
  const modelSuggestions = Array.isArray(candidate.suggestedQuestions)
    ? candidate.suggestedQuestions.filter((item): item is string => typeof item === 'string').slice(0, 3)
    : [];
  const seenSuggestions = new Set<string>();
  const questionKey = message.trim().toLocaleLowerCase();
  const suggestedQuestions = modelSuggestions.filter((suggestion) => {
    const suggestionKey = suggestion.trim().toLocaleLowerCase();
    if (!suggestionKey || suggestionKey === questionKey || seenSuggestions.has(suggestionKey)) return false;
    seenSuggestions.add(suggestionKey);
    return true;
  });
  const response = cleanResponse(candidate.response.slice(0, 1200), suggestedQuestions);
  return {
    visual: typeof candidate.visual === 'string' && allowedVisuals.has(candidate.visual) ? candidate.visual : 'general',
    label: typeof candidate.label === 'string' ? candidate.label.replace(/_/g, ' ').slice(0, 40) : 'SERA RECEPTION',
    response,
    suggestedQuestions,
  };
}

function visualForPublicQuestion(message: string, fallback: string): string {
  const input = message.toLowerCase();
  if (input.includes('launch sera') || input.includes('i want to start') || input.includes('ready to start') || input.includes('how do i access sera') || input.includes('how can i access sera') || input.includes('how to sign up') || input.includes('saya ingin mulai') || input.includes('saya siap') || input.includes('mulai sekarang') || input.includes('bagaimana saya mengakses sera') || input.includes('cara akses sera') || input.includes('cara mendaftar') || input.includes('bagaimana cara mendaftar')) return 'start';
  if (input.includes('how does sera work') || input.includes('how it works')) return 'operating';
  if (input.includes('how does sera stay safe') || input.includes('safeguard') || input.includes('security')) return 'security';
  if (input.includes('automation') || input.includes('schedule') || input.includes('transfer')) return 'automation';
  if (input.includes('wallet') || input.includes('portfolio')) return 'crypto';
  return fallback;
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
    const { message } = req.body as ReceptionPayload;
    if (typeof message !== 'string' || !message.trim() || message.length > 1200) {
      return res.status(400).json({ error: 'A message up to 1200 characters is required.' });
    }

    const normalizedMessage = message.trim().replace(/\s+/g, ' ');
    const questionKey = normalizedMessage.toLowerCase();
    const cacheKey = `${receptionKnowledgeRevision}:${questionKey}`;
    const admission = acquireRequest(req.ip || req.socket.remoteAddress || 'unknown');
    if (!admission.ok) {
      res.setHeader('Retry-After', String(admission.retryAfterSeconds));
      return res.status(429).json({ error: 'SERA Reception is receiving many requests. Please try again shortly.' });
    }
    const cached = cacheableQuestions.has(questionKey) ? publicReplyCache.get(cacheKey) : undefined;
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
        const reply = normaliseReply(JSON.parse(raw), normalizedMessage);
        reply.visual = visualForPublicQuestion(normalizedMessage, reply.visual);
        if (cacheableQuestions.has(questionKey)) publicReplyCache.set(cacheKey, { reply, expiresAt: Date.now() + publicCacheTtlMs });
        return res.json(reply);
      } catch {
        return res.json({ ...fallbackReply(), response: raw.slice(0, 1200) });
      }
    } catch {
      return res.status(502).json({ error: 'Reception provider unavailable.' });
    } finally {
      admission.release();
    }
  });

  return router;
}

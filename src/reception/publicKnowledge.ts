export type PublicReceptionTopic = 'introduction' | 'capabilities' | 'operating' | 'safeguards' | 'ecosystem' | 'automation' | 'wallet';

type TopicKnowledge = {
  topic: PublicReceptionTopic;
  triggers: string[];
  facts: string[];
  example: string;
  nextStep: string;
};

const topics: TopicKnowledge[] = [
  {
    topic: 'introduction',
    triggers: ['what is sera', 'apa itu sera', 'tentang sera', 'sera nedir', 'ما هي sera'],
    facts: [
      'SERA is a Universal Agent OS and an AI Operational Partner, not a generic chatbot.',
      'It helps a person turn context and intent into a clear, reviewable next step across the systems that matter.',
      'SERA does not silently execute meaningful actions; the user remains the decision-maker.',
    ],
    example: 'If someone wants to make a recurring operational decision, SERA first frames the context and prepares a proposal with the action, timing, affected system, and required approval.',
    nextStep: 'Help the visitor choose between understanding the operating model, safeguards, or a concrete automation example.',
  },
  {
    topic: 'capabilities',
    triggers: ['what can sera help', 'capabilities', 'fitur sera', 'what can it do'],
    facts: [
      'SERA can bring wallet intelligence, financial context, trading context, automation, tools, and connected services into one operational conversation.',
      'Its value is not a list of dashboards; it helps clarify what matters, compare the next steps, and prepare a reviewable proposal.',
      'Capabilities should always be described as assistance and preparation, never as autonomous action without approval.',
    ],
    example: 'For example, a user can ask SERA to make a recurring workflow clearer; SERA can outline the conditions, timing, and approval point before anything proceeds.',
    nextStep: 'Offer the operating model or automation as the most useful next exploration.',
  },
  {
    topic: 'operating',
    triggers: ['how does sera work', 'how it works', 'cara kerja sera'],
    facts: [
      'SERA follows a deliberate sequence: understand context, reason against intent and constraints, prepare a proposal, then wait for approval before execution.',
      'A proposal should make the action, timing, affected system, and approval requirement visible to the user.',
      'The operating model exists to preserve human judgment at the moment an intention becomes action.',
    ],
    example: 'When asked to plan a recurring transfer, SERA would first describe the schedule and destination in a proposal rather than executing the request directly.',
    nextStep: 'Invite the visitor to inspect safeguards or see an automation proposal example.',
  },
  {
    topic: 'safeguards',
    triggers: ['how does sera stay safe', 'safeguards', 'security', 'secure', 'aman', 'keamanan', 'approval'],
    facts: [
      'SERA uses scoped permissions, reviewable proposals, explicit human approval, and a clear execution record.',
      'Connections provide context; they do not grant unrestricted control.',
      'The public Reception never requests a seed phrase, private key, or wallet connection.',
    ],
    example: 'A sensitive action can be prepared and explained, but it remains at the approval gate until the user explicitly decides to proceed.',
    nextStep: 'Offer the operating model or ecosystem permissions as the next relevant topic.',
  },
  {
    topic: 'ecosystem',
    triggers: ['what can sera connect', 'ecosystem', 'connector', 'custom tool', 'integrate', 'integration', 'terhubung'],
    facts: [
      'SERA is designed around a built-in wallet layer, financial systems, services, tools, and custom connectors.',
      'Connections are selected by the user to provide relevant context for a personal Operational Partner.',
      'Do not claim a named integration or setup method unless it has been explicitly confirmed in the public product facts.',
    ],
    example: 'A connected tool can contribute context to a decision, while SERA still presents the resulting next step for review rather than acting invisibly.',
    nextStep: 'Clarify that the visitor can explore safeguards or the operating model next.',
  },
  {
    topic: 'automation',
    triggers: ['automation', 'automasi', 'schedule', 'recurring', 'transfer'],
    facts: [
      'Automation in SERA is proposal-led: a recurring request becomes a visible action plan before it can execute.',
      'The proposal should state the action, schedule, destination or affected system, and approval status.',
      'The user can approve or reject the proposal; automation is never a substitute for meaningful control.',
    ],
    example: 'A weekly operational transfer would be shown with its timing and target for review, rather than being activated silently from a short instruction.',
    nextStep: 'Offer safeguards as the natural next question.',
  },
  {
    topic: 'wallet',
    triggers: ['wallet', 'portfolio', 'crypto', 'dompet'],
    facts: [
      'SERA has a built-in wallet layer after sign-up and can use wallet context to make the next step clearer.',
      'The public Reception must not ask visitors to connect a wallet or expose sensitive wallet credentials.',
      'Wallet context can inform a proposal, but meaningful actions remain subject to the user approval model.',
    ],
    example: 'Instead of immediately suggesting an action from a balance, SERA can explain the relevant context and prepare options for the user to review.',
    nextStep: 'Offer safeguards or the operating model as the next exploration.',
  },
];

export function publicTopicContext(message: string): string {
  const input = message.toLowerCase();
  const selected = topics.find((topic) => topic.triggers.some((trigger) => input.includes(trigger)));
  if (!selected) return 'No dedicated topic was matched. Use only the public product facts from the main system prompt and do not invent details.';

  return [
    `CURRENT TOPIC: ${selected.topic.toUpperCase()}`,
    'Use these verified facts to answer the current question:',
    ...selected.facts.map((fact) => `- ${fact}`),
    `Grounded example: ${selected.example}`,
    `Recommended next direction: ${selected.nextStep}`,
  ].join('\n');
}

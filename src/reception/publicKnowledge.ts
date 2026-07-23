export type PublicReceptionTopic = 'introduction' | 'access' | 'capabilities' | 'operating' | 'safeguards' | 'ecosystem' | 'automation' | 'wallet';

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
      'SERA does not silently execute meaningful actions; the user remains the decision-maker through proposals, permissions, and approval.',
    ],
    example: 'If someone wants to make a recurring operational decision, SERA first frames the context and prepares a proposal with the action, timing, affected system, and required approval.',
    nextStep: 'Help the visitor choose between understanding the operating model, safeguards, or a concrete automation example.',
  },
  {
    topic: 'access',
    triggers: ['how do i access sera', 'how can i access sera', 'how do i start', 'how to sign up', 'bagaimana saya mengakses sera', 'cara akses sera', 'cara mendaftar', 'bagaimana cara mendaftar', 'masuk ke aplikasi', 'masuk ke sera', 'akses aplikasi'],
    facts: [
      'A visitor starts from the public landing by choosing Launch SERA.',
      'A newcomer who does not already have a wallet can sign up with email, Google, or a supported social account. Setup creates the personal account and the wallet layer needed for SERA.',
      'A crypto-native user can instead connect an existing wallet during onboarding. Both paths are valid and lead to a personal Operational Partner shaped around context, permissions, and goals.',
      'SERA never asks the visitor to share a seed phrase or personal private key. Connecting a wallet does not give SERA unrestricted control over it.',
    ],
    example: 'The public Reception explains the platform first; Launch SERA then begins the personal setup experience.',
    nextStep: 'Give a direct, calm invitation to launch SERA rather than offering a generic list of follow-up questions.',
  },
  {
    topic: 'capabilities',
    triggers: ['what can sera help', 'capabilities', 'fitur sera', 'what can it do'],
    facts: [
      'SERA brings wallet intelligence, financial context, automation, tools, and connected services into one operational conversation.',
      'Its value is not a list of dashboards; it helps clarify what matters, compare the next steps, and prepare a reviewable proposal.',
      'Capabilities should be described as assistance and preparation. Availability can depend on the connected system and the permission a user gives it.',
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
      'SERA uses scoped permissions, reviewable proposals, explicit human approval, and execution records.',
      'Connections provide context; they do not grant unrestricted control over a user account or wallet.',
      'The public Reception never requests a seed phrase, private key, or wallet connection.',
    ],
    example: 'A sensitive action can be prepared and explained, but it remains at the approval gate until the user explicitly decides to proceed.',
    nextStep: 'Offer the operating model or ecosystem permissions as the next relevant topic.',
  },
  {
    topic: 'ecosystem',
    triggers: ['what can sera connect', 'ecosystem', 'connector', 'custom tool', 'integrate', 'integration', 'terhubung'],
    facts: [
      'SERA is designed around a wallet layer, financial systems, services, tools, and connectors.',
      'Connections are selected by the user to provide relevant context for a personal Operational Partner.',
      'A connection does not mean SERA can act freely. Its scope is defined by the connected system, the user permission, and the proposal being reviewed.',
      'Do not claim a named integration or setup method unless it has been explicitly confirmed in the public product facts.',
    ],
    example: 'A connected tool can contribute context to a decision, while SERA still presents the resulting next step for review rather than acting invisibly.',
    nextStep: 'Clarify that the visitor can explore safeguards or the operating model next.',
  },
  {
    topic: 'automation',
    triggers: ['automation', 'schedule', 'recurring', 'transfer', 'proposal', 'approve', 'reject', 'agreement', 'confirmation'],
    facts: [
      'Automation in SERA is proposal-led: a recurring request first becomes a visible action plan for review.',
      'A proposal makes the action, schedule, affected system, and approval status clear before execution is considered.',
      'The user can approve or reject the proposal. Automation is never a substitute for meaningful control, and available actions depend on the connected capability.',
    ],
    example: 'A weekly operational transfer would be shown with its timing and target for review, rather than being activated silently from a short instruction.',
    nextStep: 'Offer safeguards as the natural next question.',
  },
  {
    topic: 'wallet',
    triggers: ['wallet', 'portfolio', 'crypto', 'dompet'],
    facts: [
      'SERA uses two distinct layers: a personal wallet context for the user and an operational wallet layer for SERA proposals and approved actions.',
      'Email, Google, and supported social sign-ups can begin without an existing crypto wallet. Crypto-native users can connect an existing wallet during onboarding instead.',
      'For supported managed-wallet onboarding, key management is handled by the wallet provider. SERA never asks for a seed phrase or personal private key.',
      'The public Reception must never request a seed phrase, private key, or other sensitive wallet credentials.',
      'Wallet context can inform a proposal, but connecting a wallet never grants unrestricted control and meaningful actions remain subject to approval.',
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

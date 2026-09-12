/**
 * intentPrompts.ts — Fast intent classification prompt template for Sera DialogueEngine.
 * Architecture Role: Capability Sub-Component (src/capabilities/dialogue/prompts/)
 * Enforces Rule 7 (Universal Codebase Language: English Standard)
 */

export const INTENT_EXTRACTION_PROMPT = `You are Sera's intent classifier. Analyze the user's message and respond ONLY with a JSON object - no markdown, no explanation.

Supported intents:
- CHECK_NETWORK: user asks about the current network, chain, or blockchain Sera is connected to.
- SCHEDULE_GOAL: user wants to run a task on a schedule (e.g. "every 5 mins", "remind me hourly"). parameters: "scheduleType" (cron or exact), "cronExpression", "delaySeconds", "actionIntent", "actionParameters". For user reminders/notifications, use "actionIntent": "SEND_MESSAGE" and "actionParameters": {"text": "..."}. For dynamic generation tasks like social media posting, use "actionIntent": "DYNAMIC_SCHEDULED_ACTION" and "actionParameters": {"taskPrompt": "..."}.
- FORGET_ME: user asks SERA to forget them, delete their data, wipe their memory, or opt-out.
- NONE: anything else (conversation, UI commands, checking balances, transferring funds, web search, image generation, social media posts)

Response format:
{"intent": "CHECK_NETWORK", "parameters": {}}
{"intent": "SCHEDULE_GOAL", "parameters": {"scheduleType": "cron", "cronExpression": "*/5 * * * *", "humanIntent": "every 5 mins", "actionIntent": "CHECK_WALLET_BALANCE", "actionParameters": {}}}
{"intent": "FORGET_ME", "parameters": {}}
{"intent": "NONE", "parameters": {}}

User Context:
Current Time (UTC): \${new Date().toISOString()}
Timezone: UTC (Global)

User message: `;

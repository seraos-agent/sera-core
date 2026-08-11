---
sidebar_position: 7
---

# Threads Integration (Capability Layer)

SERA OS includes a native integration with the Meta Threads API, allowing the AI agent to operate as an autonomous social manager. The integration is built into the Capability Layer, isolating API communication from the core reasoning engine.

## Architecture

The Threads integration is organized into three distinct layers to ensure security, modularity, and clean separation of concerns:

```
┌──────────────────────────────────────────┐
│             GoalBridge                   │
│   (System Execution Router / Runtime)    │
├──────────────────────────────────────────┤
│          ThreadsCapability               │
│   (Tool Definer / LLM Abstraction)       │
├──────────────┬───────────────────────────┤
│ ThreadsAPI   │       SecretManager       │
│(Meta Graph)  │ (OAuth Token Isolation)   │
└──────────────┴───────────────────────────┘
```

## 1. The Adapter: `ThreadsAPI`

The `ThreadsAPI` class acts as the low-level adapter for the `graph.threads.net` endpoint. It abstracts away the complexity of HTTP requests and containerized publishing.

Crucially, **it does not store tokens in memory**. It relies entirely on the `SecretManager` to securely fetch the long-lived access token at execution time.

```typescript
export class ThreadsAPI {
  private readonly baseUrl = 'https://graph.threads.net/v1.0';

  constructor(
    private readonly secretManager: SecretManager,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async createContainer(text: string, replyToId?: string): Promise<ThreadsContainerResponse> {
    const token = await this.getAccessToken();
    if (!token) throw new Error('Threads API requires an active access token.');

    const url = new URL(`${this.baseUrl}/me/threads`);
    url.searchParams.append('media_type', 'TEXT');
    url.searchParams.append('text', text);
    
    // ... API call execution
  }
}
```

## 2. The Capability: `ThreadsCapability`

The `ThreadsCapability` class implements the `SeraTool` interface. Its responsibility is to translate the low-level `ThreadsAPI` into high-level, semantic tools that the LLM (Cognitive Kernel) can understand and utilize.

Each tool is marked with safety flags (`requiresApproval`, `irreversible`, `unsafe`) to ensure the `ConstitutionEngine` and `DialogueEngine` enforce human-in-the-loop validation before an agent posts publicly.

```typescript
export class ThreadsCapability {
  constructor(private readonly api: ThreadsAPI) {}

  getTools(): SeraTool[] {
    return [
      {
        name: 'THREADS_PUBLISH',
        description: 'Publishes a text post to the connected Threads account.',
        parameters: { /* JSON Schema */ },
        requiresApproval: true,
        irreversible: true,
        unsafe: true,
      }
      // Future expansion: THREADS_READ_MENTIONS, THREADS_KEYWORD_SEARCH
    ];
  }
}
```

## 3. OAuth & Security

Authentication is handled outside the cognitive loop via a standard Express router (`threadsAuth.ts`). 

1. The user navigates to `/api/auth/threads`.
2. SERA requests highly privileged scopes (`threads_content_publish`, `threads_manage_replies`, `threads_manage_mentions`, etc.).
3. Meta returns a short-lived token.
4. SERA automatically exchanges this for a **60-day long-lived token**.
5. The token is stored encrypted via `SecretManager` and `EncryptedDatabaseSecretStore`.

```typescript
// Exchanging for long-lived token
const longLivedResponse = await fetch(
  `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${shortLivedToken}`
);
const longLivedToken = longLivedData.access_token;
await secretManager.setSecret('THREADS_ACCESS_TOKEN', longLivedToken);
```

## 4. Execution Pipeline (`GoalBridge`)

When the LLM decides to use `THREADS_PUBLISH`, the action is intercepted by the `GoalBridge`. The bridge orchestrates the two-step Threads publishing process (Container Creation -> Container Publishing) ensuring atomic execution.

```typescript
// Inside GoalBridge.ts
if (action.tool === 'THREADS_PUBLISH') {
    const api = new ThreadsAPI(this.secretManager);
    
    // Step 1: Create Container
    const container = await api.createContainer(action.parameters.text);
    
    // Step 2: Publish Container
    const published = await api.publishContainer(container.id);
    
    return { status: 'success', data: published };
}
```

## App Review & Production Deployment

For the integration to function without Meta's "Tester" rate limits, the Meta App must pass App Review. The following must be configured in the Meta Developer Dashboard:
- Privacy Policy URL (`/privacy`)
- Terms of Service URL (`/terms`)
- Data Deletion URL (`/data-deletion`)

These legal documents are maintained within this documentation site to satisfy Meta's compliance requirements for AI Agents.

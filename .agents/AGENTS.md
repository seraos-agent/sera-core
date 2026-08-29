# Sera Operating System Architectural Principles

This file enshrines the core architectural constraints of Sera. As an AI building Sera, you MUST obey these rules:

1. **Runtime is the Composition Root**
   - `server/index.ts` is only a boundary/adapter (Socket, HTTP, CLI).
   - Core engines (`WorldStateService`, `DialogueEngine`, `Planner`) must be instantiated and wired together inside `Runtime` or injected into it.

2. **WorldStateService Owns Reality**
   - `WorldStateService` is the single source of truth for the entire environment (Wallet, Location, Temporal, Connection, etc.).
   - Cognitive components (Dialogue, Planner, Reflection) ONLY QUERY reality. They NEVER own it or cache it independently.

3. **Immutable by Events (Event-Driven Reality)**
   - Reality enters the system ONLY through observations and events.
   - Components NEVER ask the outside world directly. They ask World State. World State asks the world (via GoalBridge/Sensors) and updates itself through the EventBus.
   - Example: Dialogue does not query the blockchain. Dialogue asks WorldState.

4. **Rich State Observation Quality**
   - WorldState is not a passive bag of values. It includes observation quality metrics.
   - Example: `WalletState` must track `balance`, `updatedAt`, `source`, `freshness`. The real world is asynchronous.

5. **Pre-Proposal Validation vs Feasibility**
   - `DialogueEngine` performs *pre-proposal validation*.
   - True *feasibility* validation inherently belongs to the Execution pipeline (e.g. before Triggers or Reflection execute a goal).
   - Any validation logic in `DialogueEngine` MUST be clearly commented with a boundary warning, noting it should be extracted to an execution-stage service when Sera scales to multiple entry points.

6. **Cognitive Telemetry Boundary**
   - Cognitive Telemetry measures the internal health and evolution of SERA. 
   - It is not a measure of user activity, nor a replacement for reasoning. 
   - Metrics provide evidence for reflection, not direct control over decisions.
   - Do NOT expose this telemetry as an 'AI analytics dashboard' to end-users.

7. **Universal Codebase Language (English Only for Code & Prompts)**
   - All source code, internal comments, docstrings, system prompts, prompt exemplars, tool descriptions, and error messages MUST be written strictly in **English (Universal Engineering Standard)**.
   - Indonesian or non-English text is ONLY permitted for dynamic user-facing responses when conversing with non-English users.
   - Hardcoding Indonesian or non-English text inside code files, system prompts, or architectural rules is strictly prohibited to ensure global developer readability and seamless team collaboration.

8. **Production Deployment Protocol (Cloud Run & Vercel)**
   - **Backend (`sera-core`)**: NEVER use `gcloud run deploy --source .` directly. The root `Dockerfile` is reserved exclusively for the public landing service (`sera-reception`). To deploy the SERA Core Socket/Agent runtime, you MUST:
     1. Build the container image via Cloud Build using: `gcloud builds submit --config cloudbuild.core.yaml .`
     2. Deploy the built image: `gcloud run deploy sera-core --image asia-southeast1-docker.pkg.dev/sera-core/sera-core-images/sera-core-api:latest --region asia-southeast1 --quiet`
   - **Frontend (`sera-frontend`)**: Deployed from `sera-frontend/` via Vercel (`npx vercel --prod`). Ensure `VITE_API_URL` is set to the Cloud Run public URL (`https://api.seraos.xyz`).
   - **CORS Configuration**: All `.vercel.app` preview/production domains and authorized custom domains must be permitted in `src/server/config.ts` via `isAllowedOrigin`.


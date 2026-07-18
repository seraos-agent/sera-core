import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { EventTypes, StandardEvent } from '../events/types';
import { ExperienceRecord } from './ExperienceRecord';
import { MemoryEvidence, EvidenceType } from './MemoryEvidence';
import { QwenAdapter } from '../../capabilities/llm/QwenAdapter';
import { VectorMemoryStore } from './VectorMemoryStore';

export class ExperienceBuilder {
  private logPath: string;
  private currentEpisode: StandardEvent[] = [];
  private episodeTimer: NodeJS.Timeout | null = null;
  private llm: QwenAdapter;
  private vectorStore: VectorMemoryStore;

  constructor(private eventBus: EventEmitter, private sessionId: string = 'default') {
    const dataDir = path.join(process.cwd(), '.data', 'sessions', sessionId);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.logPath = path.join(dataDir, 'episodic_memory.jsonl');
    this.llm = new QwenAdapter();
    this.vectorStore = new VectorMemoryStore(sessionId);
    this.setupListeners();
    console.log('[ExperienceBuilder] Initialized. Listening for episodes.');
  }

  private setupListeners() {
    const eventsToListen = [
      EventTypes.DIALOGUE_USER_OBSERVED,
      EventTypes.DIALOGUE_PROPOSAL_GENERATED,
      EventTypes.DIALOGUE_PROPOSAL_APPROVED,
      EventTypes.DIALOGUE_PROPOSAL_REJECTED,
      EventTypes.DOMAIN_GOAL_SPAWNED,
      EventTypes.DOMAIN_GOAL_RESULT,
      EventTypes.DIALOGUE_AGENT_SPEAK
    ];

    for (const type of eventsToListen) {
      this.eventBus.on(type, (event: StandardEvent) => {
        this.handleEvent(event);
      });
    }
  }

  private handleEvent(event: StandardEvent) {
    this.currentEpisode.push(event);

    // Flush episode 3 seconds after the last event in the cluster
    if (this.episodeTimer) clearTimeout(this.episodeTimer);
    this.episodeTimer = setTimeout(() => this.consolidateEpisode(), 3000);
  }

  private async consolidateEpisode() {
    if (this.currentEpisode.length === 0) return;

    const events = [...this.currentEpisode];
    this.currentEpisode = []; // reset for next episode

    const evidence: MemoryEvidence[] = events.map(e => ({
      type: e.type.startsWith('dialogue') ? EvidenceType.USER_MESSAGE : EvidenceType.DOMAIN_EVENT,
      referenceId: e.id,
      timestamp: e.timestamp
    }));

    const hasGoal = events.some(e => e.type === EventTypes.DOMAIN_GOAL_SPAWNED || e.type === EventTypes.DIALOGUE_PROPOSAL_GENERATED);
    const expType = hasGoal ? 'GOAL_EXECUTION' : 'CONVERSATION';

    const rawTranscript = events.map(e => `[${e.type}] ${JSON.stringify(e.payload)}`).join('\n');
    const prompt = `You are the Sera Experience Consolidator. Summarize the following sequence of raw system events into a single, cohesive third-person sentence describing what happened in this episode. Do not add markdown or extra explanations. Focus on the user's intent and the final outcome (success/fail). Example: "The user asked to check their wallet balance, and the agent successfully returned the balance of 10 USDC."\n\nEvents:\n${rawTranscript}`;
    
    let summary = 'System interaction processed.';
    try {
      const response = await this.llm.generate([{ role: 'user', content: prompt }]);
      summary = response.text.trim();
    } catch (e) {
      console.error('[ExperienceBuilder] Failed to generate summary', e);
    }

    const record: ExperienceRecord = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      type: expType,
      summary,
      evidence
    };

    fs.appendFile(this.logPath, JSON.stringify(record) + '\n', async (err) => {
      if (err) console.error(`[ExperienceBuilder] Failed to write record: ${err.message}`);
      else {
        console.log(`[ExperienceBuilder] Episode consolidated: ${summary}`);
        
        // Generate and store embedding
        try {
          const vector = await this.llm.embed(summary);
          this.vectorStore.insert(record.id, vector, {
            summary,
            type: record.type,
            timestamp: record.timestamp,
            evidenceIds: record.evidence.map(evidence => evidence.referenceId)
          });
        } catch (embedErr) {
          console.error('[ExperienceBuilder] Failed to generate embedding for vector store', embedErr);
        }

        // Emit for downstream bridges (e.g., EpisodicSemanticBridge)
        this.eventBus.emit('system.episode.consolidated', {
          id: `evt-${Date.now()}`,
          type: 'system.episode.consolidated',
          source: 'ExperienceBuilder',
          payload: record,
          timestamp: Date.now()
        } as StandardEvent);
      }
    });
  }
}

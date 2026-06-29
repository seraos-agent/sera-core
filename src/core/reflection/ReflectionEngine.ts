import { CognitiveQueryService } from './CognitiveQueryService';
import { PatternExtractor } from './PatternExtractor';
import { BeliefUpdateProposal } from './types';

export class ReflectionEngine {
  constructor(
    private queryService: CognitiveQueryService,
    private patternExtractor: PatternExtractor
  ) {}

  reflect(): BeliefUpdateProposal[] {
    console.log('\n[ReflectionEngine] Commencing Reflection Cycle...');
    const recentTraces = this.queryService.getRecentTraces(50);
    const patterns = this.patternExtractor.extractPatterns(recentTraces);
    
    console.log(`[ReflectionEngine] Extracted ${patterns.length} cognitive patterns from execution history.`);

    const proposals: BeliefUpdateProposal[] = [];

    for (const pattern of patterns) {
      if (pattern.type === 'REPEATED_FAILURE') {
        proposals.push({
          id: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          action: 'PROPOSE_HYPOTHESIS',
          confidence: pattern.confidence,
          evidenceIds: pattern.supportingTraceIds,
          reasoning: `Extracted Semantic Pattern: ${pattern.description}`,
          content: pattern.description,
          category: 'SEMANTIC'
        });
      }

      if (pattern.type === 'GOVERNANCE_CONFLICT') {
        proposals.push({
          id: `prop-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          action: 'PROPOSE_HYPOTHESIS',
          confidence: pattern.confidence,
          evidenceIds: pattern.supportingTraceIds,
          reasoning: `Extracted Governance Constraint: ${pattern.description}`,
          content: `Operational boundary detected: ${pattern.description}`,
          category: 'SEMANTIC'
        });
      }
    }

    if (proposals.length > 0) {
      console.log(`[ReflectionEngine] Generated ${proposals.length} Belief Update Proposals based on patterns.`);
    }

    return proposals;
  }
}

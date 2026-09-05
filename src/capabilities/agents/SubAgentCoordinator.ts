import { ISubAgent, SubAgentDomain } from './types';
import { DeFiSubAgent } from './DeFiSubAgent';
import { ProductivitySubAgent } from './ProductivitySubAgent';
import { SocialMediaAgent } from './SocialMediaAgent';
import { SystemSubAgent } from './SystemSubAgent';
import { SeraTool } from '../../core/cognitive/Tool';

export class SubAgentCoordinator {
  private readonly agents: Map<SubAgentDomain, ISubAgent> = new Map();

  constructor() {
    this.registerAgent(new DeFiSubAgent());
    this.registerAgent(new ProductivitySubAgent());
    this.registerAgent(new SocialMediaAgent());
    this.registerAgent(new SystemSubAgent());
  }

  public registerAgent(agent: ISubAgent): void {
    this.agents.set(agent.domain, agent);
  }

  public getAgent(domain: SubAgentDomain): ISubAgent | undefined {
    return this.agents.get(domain);
  }

  public getAllAgents(): ISubAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Aggregates all tools across all specialized sub-agents into a single, deduplicated tool array for Qwen 3.8.
   */
  public getAllTools(): SeraTool[] {
    const toolMap = new Map<string, SeraTool>();
    for (const agent of this.agents.values()) {
      for (const tool of agent.getTools()) {
        if (!toolMap.has(tool.name)) {
          toolMap.set(tool.name, tool);
        }
      }
    }
    return Array.from(toolMap.values());
  }

  /**
   * Aggregates tools specifically for the requested domains.
   * If 'general' is requested alone with no specialized domains, returns an empty array to prevent tool bloat.
   */
  public getToolsForDomains(domains: SubAgentDomain[]): SeraTool[] {
    const toolMap = new Map<string, SeraTool>();
    const activeDomains = new Set(domains);

    for (const agent of this.agents.values()) {
      if (activeDomains.has(agent.domain)) {
        for (const tool of agent.getTools()) {
          if (!toolMap.has(tool.name)) {
            toolMap.set(tool.name, tool);
          }
        }
      }
    }
    return Array.from(toolMap.values());
  }

  /**
   * Generates a composite system prompt overlay detailing each sub-agent's domain authority.
   */
  public getCompositeSystemPrompt(): string {
    const sections = Array.from(this.agents.values()).map(a => 
      `### ${a.name} [Domain: ${a.domain.toUpperCase()}]\n${a.getSystemPrompt()}`
    );
    return `## SERA SPECIALIZED SUB-AGENT DOMAINS\nSERA operates via specialized sub-agent capabilities. You can seamlessly invoke and combine tools across any of these domains within a single multi-step ReAct turn:\n\n${sections.join('\n\n')}`;
  }

  /**
   * Generates a focused system prompt overlay containing only the active sub-agent domains.
   */
  public getSystemPromptForDomains(domains: SubAgentDomain[]): string {
    const activeDomains = new Set(domains);
    const matchedAgents = Array.from(this.agents.values()).filter(a => activeDomains.has(a.domain));

    if (matchedAgents.length === 0) {
      return '';
    }

    const sections = matchedAgents.map(a => 
      `### ${a.name} [Domain: ${a.domain.toUpperCase()}]\n${a.getSystemPrompt()}`
    );
    return `## SERA ACTIVE DOMAIN CAPABILITIES\nYou have authorized access to the following specialized domain capabilities for this turn:\n\n${sections.join('\n\n')}`;
  }
}

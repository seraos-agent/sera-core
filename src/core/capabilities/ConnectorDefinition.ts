import { SeraTool } from '../cognitive/Tool';

/**
 * ConnectorDefinition
 *
 * A rich descriptor for a Sera capability connector. Each connector groups
 * a set of tools under a named identity with category, risk metadata, and
 * an activation gate.
 *
 * Connectors marked `alwaysActive` bypass the user opt-in flow and are
 * available to the agent from the moment the system boots.
 */
export interface ConnectorDefinition {
  /** Unique machine identifier, e.g. 'polymarket', 'hyperliquid-market-data'. */
  id: string;

  /** Human-readable display name, e.g. 'Polymarket (Polygon)'. */
  name: string;

  /** UI grouping category. */
  category: 'finance' | 'communication' | 'connectors' | 'quests';

  /** Short one-liner shown on the workspace card. */
  description: string;

  /**
   * Education / risk summary shown in the activation modal.
   * Written in English. Sera may translate dynamically when conversing.
   */
  riskSummary: string;

  /** Optional blockchain network label, e.g. 'Polygon PoS', 'Base'. */
  network?: string;

  /** If true, this connector is always available and cannot be deactivated. */
  alwaysActive: boolean;

  /** The SeraTool definitions that this connector exposes to the LLM. */
  tools: SeraTool[];

  /**
   * Optional direct executor. If provided, the ToolExecutionHandler can
   * delegate tool calls directly to the connector without going through
   * the GoalBridge / event pipeline.
   */
  executeTool?: (toolName: string, args: Record<string, any>) => Promise<any>;
}

/**
 * A lightweight summary of a connector, safe to send over the wire.
 * Contains no tool schemas or execution functions.
 */
export interface ConnectorSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  riskSummary: string;
  network?: string;
  alwaysActive: boolean;
  isActive: boolean;
  toolCount: number;
  toolNames: string[];
}

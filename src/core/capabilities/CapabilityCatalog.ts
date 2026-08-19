import { SeraTool } from '../cognitive/Tool';
import { ConnectorDefinition, ConnectorSummary } from './ConnectorDefinition';
import { ConnectorActivationStore } from './ConnectorActivationStore';

/**
 * CapabilityCatalog
 * 
 * The central metadata registry for the Sera OS.
 * It manages the discovery of Tools, Sensors, Policies, and Events
 * exposed by all active Capabilities.
 * 
 * Refactored to be connector-aware: tools are grouped under ConnectorDefinitions,
 * and only tools from ACTIVE connectors are returned to the LLM.
 * 
 * It acts purely as a Catalog, not an execution engine.
 */
export class CapabilityCatalog {
  private connectors: Map<string, ConnectorDefinition> = new Map();
  private activationStore: ConnectorActivationStore;

  /** Legacy flat tool map — kept for MCP and system-level tools that are not part of a connector. */
  private systemTools: Map<string, SeraTool> = new Map();

  constructor(activationStore?: ConnectorActivationStore) {
    this.activationStore = activationStore || new ConnectorActivationStore();
  }

  /**
   * Ensures the underlying activation store has loaded persistent state.
   */
  public async waitForLoad(): Promise<void> {
    await this.activationStore.waitForLoad();
  }

  // ── Connector-Aware API ──────────────────────────────────────────────────

  /**
   * Registers a full connector definition into the catalog.
   */
  public registerConnector(connector: ConnectorDefinition): void {
    if (this.connectors.has(connector.id)) {
      console.warn(`[CapabilityCatalog] Warning: Connector '${connector.id}' is being overwritten.`);
    }
    this.connectors.set(connector.id, connector);
    console.log(`[CapabilityCatalog] Registered connector: ${connector.id} (${connector.tools.length} tools, alwaysActive=${connector.alwaysActive})`);
  }

  /**
   * Returns a specific connector by ID.
   */
  public getConnector(id: string): ConnectorDefinition | undefined {
    return this.connectors.get(id);
  }

  /**
   * Activate a connector. Delegates to ConnectorActivationStore.
   */
  public activateConnector(id: string): void {
    const connector = this.connectors.get(id);
    if (!connector) {
      console.warn(`[CapabilityCatalog] Cannot activate unknown connector: ${id}`);
      return;
    }
    if (connector.alwaysActive) {
      console.warn(`[CapabilityCatalog] Connector '${id}' is always active. No action needed.`);
      return;
    }
    this.activationStore.activate(id);
  }

  /**
   * Deactivate a connector. Delegates to ConnectorActivationStore.
   */
  public deactivateConnector(id: string): void {
    const connector = this.connectors.get(id);
    if (!connector) {
      console.warn(`[CapabilityCatalog] Cannot deactivate unknown connector: ${id}`);
      return;
    }
    if (connector.alwaysActive) {
      console.warn(`[CapabilityCatalog] Connector '${id}' is always active and cannot be deactivated.`);
      return;
    }
    this.activationStore.deactivate(id);
  }

  /**
   * Check if a connector is currently active (either always-on or user-activated).
   */
  public isConnectorActive(id: string): boolean {
    const connector = this.connectors.get(id);
    if (!connector) return false;
    return connector.alwaysActive || this.activationStore.isActive(id);
  }

  /**
   * Returns lightweight summaries of ALL connectors (active and inactive).
   * Safe to send over the wire to the frontend.
   */
  public allConnectorSummaries(): ConnectorSummary[] {
    return Array.from(this.connectors.values()).map(c => ({
      id: c.id,
      name: c.name,
      category: c.category,
      description: c.description,
      riskSummary: c.riskSummary,
      network: c.network,
      alwaysActive: c.alwaysActive,
      isActive: this.isConnectorActive(c.id),
      toolCount: c.tools.length,
      toolNames: c.tools.map(t => t.name),
    }));
  }

  // ── Tool API (used by DialogueEngine / ToolExecutionHandler) ─────────────

  /**
   * Registers system-level tools that are not part of any connector (e.g. MCP tools).
   * These tools are always available regardless of connector activation state.
   */
  public registerTools(tools: SeraTool[]): void {
    for (const tool of tools) {
      if (this.systemTools.has(tool.name)) {
        console.warn(`[CapabilityCatalog] Warning: System tool '${tool.name}' is being overwritten.`);
      }
      this.systemTools.set(tool.name, tool);
    }
  }

  /**
   * Returns all available tools: system tools + tools from ACTIVE connectors only.
   * This is the gating function that prevents inactive connector tools from reaching the LLM.
   */
  public availableTools(): SeraTool[] {
    const tools: SeraTool[] = [];

    // 1. Always include system-level tools (MCP, REMEMBER_FACT, etc.)
    tools.push(...this.systemTools.values());

    // 2. Include tools from connectors that are active
    for (const connector of this.connectors.values()) {
      if (this.isConnectorActive(connector.id)) {
        tools.push(...connector.tools);
      }
    }

    return tools;
  }

  /**
   * Retrieves a specific tool by name. Searches both system tools and active connector tools.
   */
  public getTool(name: string): SeraTool | undefined {
    // Check system tools first
    const systemTool = this.systemTools.get(name);
    if (systemTool) return systemTool;

    // Then check active connector tools
    for (const connector of this.connectors.values()) {
      if (this.isConnectorActive(connector.id)) {
        const tool = connector.tools.find(t => t.name === name);
        if (tool) return tool;
      }
    }

    return undefined;
  }

  /**
   * Find the connector that owns a given tool name.
   */
  public getConnectorForTool(toolName: string): ConnectorDefinition | undefined {
    for (const connector of this.connectors.values()) {
      if (connector.tools.some(t => t.name === toolName)) {
        return connector;
      }
    }
    return undefined;
  }
}

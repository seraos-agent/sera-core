import { SeraTool } from '../cognitive/Tool';

/**
 * CapabilityCatalog
 * 
 * The central metadata registry for the SERA OS.
 * It manages the discovery of Tools, Sensors, Policies, and Events
 * exposed by all active Capabilities.
 * 
 * It acts purely as a Catalog, not an execution engine.
 */
export class CapabilityCatalog {
  private tools: Map<string, SeraTool> = new Map();

  /**
   * Registers a capability's tools into the catalog.
   */
  public registerTools(tools: SeraTool[]): void {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        console.warn(`[CapabilityCatalog] Warning: Tool '${tool.name}' is being overwritten.`);
      }
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Returns all available tools in the OS.
   */
  public availableTools(): SeraTool[] {
    return Array.from(this.tools.values());
  }
}

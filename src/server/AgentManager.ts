import { SeraAgentInstance } from './SeraAgentInstance';

export class AgentManager {
  private instances: Map<string, SeraAgentInstance> = new Map();

  public getOrCreateInstance(sessionId: string): SeraAgentInstance {
    const id = sessionId.toLowerCase();
    let instance = this.instances.get(id);
    
    if (!instance) {
      console.log(`[AgentManager] Spawning new Sera Agent Instance for ${id}`);
      instance = new SeraAgentInstance(id);
      instance.start();
      this.instances.set(id, instance);
    }
    
    return instance;
  }

  public getInstance(sessionId: string): SeraAgentInstance | undefined {
    return this.instances.get(sessionId.toLowerCase());
  }

  public shutdownAll(): void {
    for (const instance of this.instances.values()) {
      instance.stop();
    }
    this.instances.clear();
  }
}

export const agentManager = new AgentManager();

export interface AdaptableSubsystem {
  id: string;
  applyMutation(key: string, value: any): void;
  getOriginalValue(key: string): any;
  validateMutation(key: string, value: any): boolean;
}

export class SubsystemRegistrar {
  private subsystems: Map<string, AdaptableSubsystem> = new Map();

  public register(subsystem: AdaptableSubsystem) {
    this.subsystems.set(subsystem.id, subsystem);
  }

  public getSubsystem(id: string): AdaptableSubsystem | undefined {
    return this.subsystems.get(id);
  }

  public getAllRegistered(): string[] {
    return Array.from(this.subsystems.keys());
  }
}

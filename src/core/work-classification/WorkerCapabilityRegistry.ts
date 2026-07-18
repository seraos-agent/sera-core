import { WorkClass } from './WorkClassificationPolicy';

export type WorkerLane = 'DETERMINISTIC_UI' | 'DIALOGUE' | 'TOOL_EXECUTION' | 'SWARM_REVIEW' | 'GOVERNED_EXECUTION';

export interface WorkerCapabilityDescriptor {
  id: string;
  lane: WorkerLane;
  supportedWorkClasses: WorkClass[];
}

const permittedClasses: Record<WorkerLane, readonly WorkClass[]> = {
  DETERMINISTIC_UI: ['INSTANT_UI'],
  DIALOGUE: ['CONVERSATION'],
  TOOL_EXECUTION: ['OPERATIONAL'],
  SWARM_REVIEW: ['COMPLEX'],
  GOVERNED_EXECUTION: ['HIGH_RISK']
};

/**
 * Product-level placement boundary. It does not execute work or duplicate
 * WorkerPool; it prevents a worker from being registered for an unsafe lane.
 */
export class WorkerCapabilityRegistry {
  private readonly descriptors = new Map<string, WorkerCapabilityDescriptor>();

  public register(descriptor: WorkerCapabilityDescriptor): void {
    if (this.descriptors.has(descriptor.id)) throw new Error(`Worker ${descriptor.id} is already registered.`);
    const permitted = permittedClasses[descriptor.lane];
    if (descriptor.supportedWorkClasses.length === 0 || descriptor.supportedWorkClasses.some(workClass => !permitted.includes(workClass))) {
      throw new Error(`Worker ${descriptor.id} cannot serve the declared work class from lane ${descriptor.lane}.`);
    }
    this.descriptors.set(descriptor.id, { ...descriptor, supportedWorkClasses: [...descriptor.supportedWorkClasses] });
  }

  public require(workClass: WorkClass, lane?: WorkerLane): WorkerCapabilityDescriptor {
    const match = [...this.descriptors.values()].find(descriptor =>
      descriptor.supportedWorkClasses.includes(workClass) && (!lane || descriptor.lane === lane)
    );
    if (!match) throw new Error(`No registered worker is permitted for ${workClass}${lane ? ` in ${lane}` : ''}.`);
    return { ...match, supportedWorkClasses: [...match.supportedWorkClasses] };
  }
}

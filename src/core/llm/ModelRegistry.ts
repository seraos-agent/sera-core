import { ILLMAdapter } from './types';

export class ModelRegistry {
  private readonly adapters: ReadonlyArray<ILLMAdapter>;

  constructor(adapters: ILLMAdapter[]) {
    this.adapters = Object.freeze([...adapters]);
    console.log(`[ModelRegistry] Frozen with ${this.adapters.length} models.`);
  }

  public getAdapters(): ReadonlyArray<ILLMAdapter> {
    return this.adapters;
  }
}

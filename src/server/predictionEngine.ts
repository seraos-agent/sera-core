import { EventEmitter } from 'node:events';
import { PredictionEngineService } from '../capabilities/predictions/PredictionEngineService';

export const arenaEventBus = new EventEmitter();
export const predictionEngine = new PredictionEngineService(arenaEventBus);
setInterval(() => predictionEngine.tick(), 1000); // 1 sec cron

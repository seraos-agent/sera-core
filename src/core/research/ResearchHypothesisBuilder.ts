import { EventStudyConfig, EventStudyEngine, PriceCandle } from './EventStudyEngine';

export interface ResearchHypothesisReport {
  status: 'HYPOTHESIS';
  sampleSize: number;
  configuration: EventStudyConfig;
  upwardEvents: number;
  downwardEvents: number;
  averageAbsoluteMovePercent: number;
  limitations: string[];
}

/** Builds an auditable hypothesis report; it deliberately contains no trade action or forecast. */
export class ResearchHypothesisBuilder {
  constructor(private readonly events = new EventStudyEngine()) {}

  build(candles: PriceCandle[], configuration: EventStudyConfig): ResearchHypothesisReport {
    const detected = this.events.detect(candles, configuration);
    const upwardEvents = detected.filter(event => event.direction === 'UP').length;
    const downwardEvents = detected.filter(event => event.direction === 'DOWN').length;
    return {
      status: 'HYPOTHESIS', sampleSize: candles.length, configuration, upwardEvents, downwardEvents,
      averageAbsoluteMovePercent: detected.length ? detected.reduce((total, event) => total + Math.abs(event.changePercent), 0) / detected.length : 0,
      limitations: ['Historical event counts do not establish causation or future performance.', 'No fees, slippage, out-of-sample validation, or market-regime analysis has been applied.', 'This report is not a trading signal or execution instruction.']
    };
  }
}

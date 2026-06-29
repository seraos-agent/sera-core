import { MetaEvaluationReport, MetaMetrics } from './types';

export interface TrendAnalysis {
  trend: 'IMPROVING' | 'DEGRADING' | 'STABLE' | 'RECOVERING';
  acceleration: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  volatility: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
}

export class MetaEvaluationHistory {
  private history: MetaEvaluationReport[] = [];

  record(report: MetaEvaluationReport): void {
    this.history.push(report);
  }

  getHistory(): MetaEvaluationReport[] {
    return [...this.history];
  }

  getLatestReport(): MetaEvaluationReport | undefined {
    return this.history[this.history.length - 1];
  }

  analyzeTrend(metricKey: keyof MetaMetrics): TrendAnalysis {
    if (this.history.length < 2) {
      return { trend: 'STABLE', acceleration: 'NEUTRAL', volatility: 'LOW', confidence: 0.1 };
    }

    // Look at last 5 reports for short-term trend
    const window = this.history.slice(-5);
    const values = window.map(r => r.metrics[metricKey]);
    
    const start = values[0];
    const end = values[values.length - 1];
    const delta = end - start;
    
    let trend: 'IMPROVING' | 'DEGRADING' | 'STABLE' | 'RECOVERING' = 'STABLE';
    
    // For SDS, higher is worse. For others, higher is better.
    const isErrorMetric = metricKey === 'SDS';
    const improved = isErrorMetric ? delta < -0.1 : delta > 0.1;
    const degraded = isErrorMetric ? delta > 0.1 : delta < -0.1;

    if (improved) trend = 'IMPROVING';
    else if (degraded) trend = 'DEGRADING';

    // Check for Recovery: If historically bad, but end is better
    if (window.length > 2) {
      const mid = values[Math.floor(values.length / 2)];
      const midDegraded = isErrorMetric ? mid > start : mid < start;
      if (midDegraded && improved) {
        trend = 'RECOVERING';
      }
    }

    // Acceleration: difference in deltas
    let acceleration: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = 'NEUTRAL';
    if (window.length >= 3) {
      const delta1 = values[1] - values[0];
      const delta2 = values[values.length - 1] - values[values.length - 2];
      
      const rateOfChange = delta2 - delta1;
      if (Math.abs(rateOfChange) > 0.05) {
        // Accelerating towards the trend?
        const isAccelerating = isErrorMetric 
          ? (trend === 'DEGRADING' ? rateOfChange > 0 : rateOfChange < 0)
          : (trend === 'DEGRADING' ? rateOfChange < 0 : rateOfChange > 0);
          
        acceleration = isAccelerating ? 'POSITIVE' : 'NEGATIVE';
      }
    }

    // Volatility: variance approximation
    let volatility: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let sum = 0;
    for (let i = 1; i < values.length; i++) {
      sum += Math.abs(values[i] - values[i - 1]);
    }
    const avgDelta = sum / (values.length - 1);
    if (avgDelta > 0.5) volatility = 'HIGH';
    else if (avgDelta > 0.2) volatility = 'MEDIUM';

    // Confidence: increases with more data points in the window, decreases with extreme volatility
    let confidence = Math.min(1.0, window.length * 0.2);
    if (volatility === 'HIGH') confidence *= 0.5;

    return { trend, acceleration, volatility, confidence };
  }
}

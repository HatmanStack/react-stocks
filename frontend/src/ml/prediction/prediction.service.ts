/**
 * Stock Prediction Service (Browser-Based ML)
 *
 * JavaScript implementation of the Python logistic regression prediction service.
 * Provides stock price predictions for three time horizons using browser-native ML.
 *
 * **Phase 5 Update:** Now uses three-signal sentiment architecture for improved accuracy.
 */

import { StandardScaler } from './scaler';
import { LogisticRegressionCV } from './cross-validation';
import { buildFeatureMatrix, createLabels } from './preprocessing';
import type { PredictionInput, PredictionOutput } from './types';
import type { EventType } from '../../types/database.types';

/**
 * Time horizons for predictions (in trading days)
 */
const HORIZONS = {
  NEXT: 1, // Next day
  WEEK: 10, // 2 weeks
  MONTH: 21, // 1 month
} as const;

/**
 * Minimum data points required for predictions
 * (8 folds for CV + 21 day horizon = 29)
 */
const MIN_DATA_POINTS = 29;

/**
 * Get stock price predictions using logistic regression model
 *
 * **Phase 5 Update:** Now accepts three-signal sentiment parameters for improved accuracy.
 * Legacy parameters (positiveCounts, negativeCounts, sentimentScores) are deprecated but
 * maintained for backward compatibility.
 *
 * @param ticker - Stock ticker symbol
 * @param closePrices - Array of closing prices
 * @param volumes - Array of trading volumes
 * @param positiveCounts - (DEPRECATED) Array of positive word counts
 * @param negativeCounts - (DEPRECATED) Array of negative word counts
 * @param sentimentScores - (DEPRECATED) Array of sentiment categories
 * @param eventTypes - Array of event type classifications
 * @param aspectScores - Array of aspect sentiment scores (-1 to +1)
 * @param mlScores - Array of ML model scores (-1 to +1)
 * @param signalScores - Array of signal scores (0 to 1, metadata quality)
 * @returns Prediction results for next day, 2 weeks, and 1 month
 * @throws Error if insufficient data or invalid inputs
 *
 * @example
 * ```typescript
 * // New usage with three-signal sentiment
 * const predictions = await getStockPredictions(
 *   'AAPL',
 *   closePrices,
 *   volumes,
 *   [], // deprecated
 *   [], // deprecated
 *   [], // deprecated
 *   eventTypes,
 *   aspectScores,
 *   mlScores
 * );
 * ```
 */
export async function getStockPredictions(
  ticker: string,
  closePrices: number[],
  volumes: number[],
  _positiveCounts: number[] = [],
  _negativeCounts: number[] = [],
  _sentimentScores: string[] = [],
  eventTypes?: EventType[],
  aspectScores?: number[],
  mlScores?: number[],
  signalScores?: number[]
): Promise<PredictionOutput> {
  const startTime = performance.now();

  try {
    // Validate inputs
    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    if (closePrices.length < MIN_DATA_POINTS) {
      throw new Error(
        `Insufficient data: need at least ${MIN_DATA_POINTS} data points, got ${closePrices.length}`
      );
    }

    // Build input structure with three-signal sentiment
    const input: PredictionInput = {
      ticker,
      close: closePrices,
      volume: volumes,
      eventType: eventTypes,
      aspectScore: aspectScores,
      mlScore: mlScores,
      signalScore: signalScores,
    };

    console.log(
      `[PredictionService] Generating predictions for ${ticker} (${closePrices.length} data points)` +
        (eventTypes ? ` with three-signal sentiment` : ` without sentiment signals`)
    );
    console.log(`[PredictionService] Input validation:`);
    console.log(`  - closePrices: ${closePrices.length} (first: ${closePrices[0]?.toFixed(2)}, last: ${closePrices[closePrices.length-1]?.toFixed(2)})`);
    console.log(`  - volumes: ${volumes.length}`);
    console.log(`  - eventTypes: ${eventTypes?.length || 0}`);
    console.log(`  - aspectScores: ${aspectScores?.length || 0} (non-zero: ${aspectScores?.filter(s => s !== 0).length || 0})`);
    console.log(`  - mlScores: ${mlScores?.length || 0} (non-zero: ${mlScores?.filter(s => s !== 0).length || 0})`);
    console.log(`  - signalScores: ${signalScores?.length || 0}`);

    // Build feature matrix (15 features with three-signal sentiment + availability)
    console.log(`[PredictionService] Building feature matrix...`);
    const features = buildFeatureMatrix(input);
    console.log(`[PredictionService] Feature matrix built: ${features.length} rows x ${features[0]?.length || 0} cols`);

    // Make predictions for each horizon
    const predictions: { [key: string]: number } = {};

    for (const [name, horizon] of Object.entries(HORIZONS)) {
      // Generate labels for this horizon
      const labels = createLabels(closePrices, horizon);

      // Need at least 3 samples for meaningful prediction
      if (labels.length < 3) {
        console.warn(
          `[PredictionService] ${ticker} ${name}: Only ${labels.length} samples, using default 0.5`
        );
        predictions[name] = 0.5; // Neutral prediction
        continue;
      }

      // Truncate features to match label length
      // (last `horizon` data points have no labels)
      const X = features.slice(0, labels.length);
      const y = labels;

      // Generate exponential decay weights for time-weighted sampling
      // More recent data points get higher weight
      // Weight = exp(-lambda * age), where age = (n-1-i) and lambda controls decay rate
      const n = y.length;
      const halfLife = Math.max(10, n / 4); // Half-life: weight halves every halfLife samples
      const lambda = Math.log(2) / halfLife;
      const sampleWeights: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const age = n - 1 - i; // 0 for most recent, n-1 for oldest
        sampleWeights[i] = Math.exp(-lambda * age);
      }

      // Log weight distribution for diagnostics
      const minWeight = Math.min(...sampleWeights);
      const maxWeight = Math.max(...sampleWeights);
      console.log(
        `[PredictionService] ${ticker} ${name}: Sample weights range [${minWeight.toFixed(3)}, ${maxWeight.toFixed(3)}], halfLife=${halfLife.toFixed(0)}`
      );

      // Scale features
      const scaler = new StandardScaler();
      const X_scaled = scaler.fitTransform(X);

      // Train model with weighted samples and balanced classes
      const model = new LogisticRegressionCV();
      const k = Math.min(8, y.length); // Can't have more folds than samples
      if (k < 2) {
        console.warn(`[PredictionService] ${ticker} ${name}: Only ${y.length} samples, skipping CV`);
        // Train without CV if too few samples, but with weights
        model.fit(X_scaled, y, {
          sampleWeights,
          classWeight: 'balanced',
          maxIterations: 2000, // More iterations for better convergence
          learningRate: 0.005, // Slower learning for stability
        });
      } else {
        model.fitCV(X_scaled, y, k, {
          sampleWeights,
          classWeight: 'balanced',
          maxIterations: 2000,
          learningRate: 0.005,
        });
      }

      // Get CV score for diagnostics
      const cvScore = model.getMeanCVScore();
      console.log(
        `[PredictionService] ${ticker} ${name}: CV score = ${cvScore?.toFixed(4) || 'N/A'}`
      );

      // Predict on most recent data point (after training on historical)
      // Scale the most recent observation
      const mostRecentFeature = features[features.length - 1];
      const X_recent = scaler.transform([mostRecentFeature]);

      // Get probability of class 1 (down) - predictProba returns [[p0, p1]]
      const probabilities = model.predictProba(X_recent)[0];
      const prediction = probabilities[1]; // Probability of "down"
      predictions[name] = prediction;
    }

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    console.log(
      `[PredictionService] Predictions for ${ticker}: ` +
        `next=${predictions.NEXT}, week=${predictions.WEEK}, month=${predictions.MONTH} ` +
        `(${duration}ms)`
    );

    // Format response - use 4 decimal places for precision
    return {
      next: predictions.NEXT.toFixed(4),
      week: predictions.WEEK.toFixed(4),
      month: predictions.MONTH.toFixed(4),
      ticker,
    };
  } catch (error) {
    console.error('[PredictionService] Error generating predictions:', error);
    throw error;
  }
}

/**
 * Parse prediction response to numeric values
 * (Kept for compatibility with existing code)
 *
 * @param response - Prediction response
 * @returns Parsed prediction values as numbers
 */
export function parsePredictionResponse(response: PredictionOutput): {
  nextDay: number;
  twoWeeks: number;
  oneMonth: number;
  ticker: string;
} {
  return {
    nextDay: parseFloat(response.next),
    twoWeeks: parseFloat(response.week),
    oneMonth: parseFloat(response.month),
    ticker: response.ticker,
  };
}

/**
 * Get default predictions when insufficient data
 *
 * @param ticker - Stock ticker symbol
 * @returns Default prediction response (all 0.0)
 */
export function getDefaultPredictions(ticker: string): PredictionOutput {
  console.warn(
    `[PredictionService] Using default predictions for ${ticker} (insufficient data)`
  );

  return {
    next: '0.0',
    week: '0.0',
    month: '0.0',
    ticker,
  };
}

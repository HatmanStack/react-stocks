/**
 * Stock Prediction Service (Browser-Based ML)
 *
 * JavaScript implementation of the Python logistic regression prediction service.
 * Provides stock price predictions for three time horizons using browser-native ML.
 */

import { StandardScaler } from './scaler';
import { LogisticRegressionCV } from './cross-validation';
import { buildFeatureMatrix, createLabels } from './preprocessing';
import type { PredictionInput, PredictionOutput } from './types';

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
 * Matches the interface of the existing Python service.
 *
 * @param ticker - Stock ticker symbol
 * @param closePrices - Array of closing prices
 * @param volumes - Array of trading volumes
 * @param positiveCounts - Array of positive word counts from sentiment analysis
 * @param negativeCounts - Array of negative word counts from sentiment analysis
 * @param sentimentScores - Array of sentiment categories ("POS", "NEG", "NEUT")
 * @returns Prediction results for next day, 2 weeks, and 1 month
 * @throws Error if insufficient data or invalid inputs
 */
export async function getStockPredictions(
  ticker: string,
  closePrices: number[],
  volumes: number[],
  positiveCounts: number[],
  negativeCounts: number[],
  sentimentScores: string[]
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

    // Build input structure
    const input: PredictionInput = {
      ticker,
      close: closePrices,
      volume: volumes,
      positive: positiveCounts,
      negative: negativeCounts,
      sentiment: sentimentScores,
    };

    console.log(
      `[PredictionService] Generating predictions for ${ticker} (${closePrices.length} data points)`
    );

    // Build feature matrix (n × 8)
    const features = buildFeatureMatrix(input);

    // Make predictions for each horizon
    const predictions: { [key: string]: number } = {};

    for (const [name, horizon] of Object.entries(HORIZONS)) {
      // Generate labels for this horizon
      const labels = createLabels(closePrices, horizon);

      if (labels.length === 0) {
        throw new Error(
          `Insufficient data for ${name} prediction (horizon=${horizon}): ` +
            `need at least ${horizon + 1} data points`
        );
      }

      // Truncate features to match label length
      // (last `horizon` data points have no labels)
      const X = features.slice(0, labels.length);
      const y = labels;

      // Scale features
      const scaler = new StandardScaler();
      const X_scaled = scaler.fitTransform(X);

      // Train model with 8-fold CV
      const model = new LogisticRegressionCV();
      model.fitCV(X_scaled, y, 8);

      // Get CV score for diagnostics
      const cvScore = model.getMeanCVScore();
      console.log(
        `[PredictionService] ${ticker} ${name}: CV score = ${cvScore?.toFixed(4) || 'N/A'}`
      );

      // Predict on most recent data point (after training on historical)
      // Scale the most recent observation
      const mostRecentFeature = features[features.length - 1];
      const X_recent = scaler.transform([mostRecentFeature]);

      // Make prediction
      const prediction = model.predict(X_recent)[0];
      predictions[name] = prediction;
    }

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    console.log(
      `[PredictionService] Predictions for ${ticker}: ` +
        `next=${predictions.NEXT}, week=${predictions.WEEK}, month=${predictions.MONTH} ` +
        `(${duration}ms)`
    );

    // Format response to match Python service
    return {
      next: predictions.NEXT.toFixed(1),
      week: predictions.WEEK.toFixed(1),
      month: predictions.MONTH.toFixed(1),
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

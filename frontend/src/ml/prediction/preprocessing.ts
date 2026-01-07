/**
 * Feature Engineering and Preprocessing
 *
 * Functions for converting raw stock data into feature matrices
 * and labels for logistic regression training.
 *
 * **Phase 4 Update:** Added support for three-signal sentiment architecture
 * (eventType, aspectScore, mlScore) increasing feature count from 8 to 13.
 *
 * **Phase 5 Update:** Added signalScore feature increasing count from 13 to 14.
 * **Phase 6 Update:** Added sentimentAvailability feature increasing count from 14 to 15.
 * This allows predictions to run even when sentiment data is incomplete.
 */

import type { PredictionInput, FeatureMatrix, Labels } from './types';
import type { EventType } from '../../types/database.types';

/**
 * One-hot encode event types
 *
 * Converts categorical event types into binary features.
 * Order: EARNINGS, M&A, PRODUCT_LAUNCH, ANALYST_RATING, GUIDANCE, GENERAL
 *
 * @param eventTypes - Array of event type strings
 * @returns 2D array with 6 columns (one per event type)
 *
 * @example
 * ```typescript
 * oneHotEncodeEventType(['EARNINGS', 'M&A', 'GENERAL'])
 * // Returns:
 * // [[1, 0, 0, 0, 0, 0],  // EARNINGS
 * //  [0, 1, 0, 0, 0, 0],  // M&A
 * //  [0, 0, 0, 0, 0, 1]]  // GENERAL
 * ```
 */
export function oneHotEncodeEventType(eventTypes: EventType[]): number[][] {
  const encoded: number[][] = [];

  for (const eventType of eventTypes) {
    const normalized = eventType ?? 'GENERAL';

    if (normalized === 'EARNINGS') {
      encoded.push([1, 0, 0, 0, 0, 0]);
    } else if (normalized === 'M&A') {
      encoded.push([0, 1, 0, 0, 0, 0]);
    } else if (normalized === 'PRODUCT_LAUNCH') {
      encoded.push([0, 0, 1, 0, 0, 0]);
    } else if (normalized === 'ANALYST_RATING') {
      encoded.push([0, 0, 0, 1, 0, 0]);
    } else if (normalized === 'GUIDANCE') {
      encoded.push([0, 0, 0, 0, 1, 0]);
    } else {
      // GENERAL or unknown
      encoded.push([0, 0, 0, 0, 0, 1]);
    }
  }

  return encoded;
}

/**
 * One-hot encode sentiment categories (DEPRECATED)
 *
 * @deprecated Use oneHotEncodeEventType instead. This is kept for backward compatibility only.
 * @param sentiment - Array of sentiment strings ("POS", "NEG", "NEUT", or others)
 * @returns 2D array with 4 columns: [is_pos, is_neg, is_neut, is_unknown]
 */
export function oneHotEncode(sentiment: string[]): number[][] {
  const encoded: number[][] = [];

  for (const s of sentiment) {
    const normalized = s ? s.toUpperCase().trim() : 'UNKNOWN';

    if (normalized === 'POS') {
      encoded.push([1, 0, 0, 0]); // is_pos=1
    } else if (normalized === 'NEG') {
      encoded.push([0, 1, 0, 0]); // is_neg=1
    } else if (normalized === 'NEUT' || normalized === 'NEUTRAL') {
      encoded.push([0, 0, 1, 0]); // is_neut=1
    } else {
      encoded.push([0, 0, 0, 1]); // is_unknown=1
    }
  }

  return encoded;
}

/**
 * Calculate price ratios for different time horizons
 *
 * @param close - Array of closing prices
 * @returns Object with price ratio arrays for 1d, 5d, 10d horizons
 */
function calculatePriceRatios(close: number[]): {
  ratio1d: number[];
  ratio5d: number[];
  ratio10d: number[];
} {
  const n = close.length;
  const ratio1d: number[] = [];
  const ratio5d: number[] = [];
  const ratio10d: number[] = [];

  for (let i = 0; i < n; i++) {
    // 1-day ratio: close[i] / close[i-1], or 1.0 if i=0
    ratio1d.push(i > 0 ? close[i] / close[i - 1] : 1.0);

    // 5-day ratio: close[i] / close[i-5], or 1.0 if i<5
    ratio5d.push(i >= 5 ? close[i] / close[i - 5] : 1.0);

    // 10-day ratio: close[i] / close[i-10], or 1.0 if i<10
    ratio10d.push(i >= 10 ? close[i] / close[i - 10] : 1.0);
  }

  return { ratio1d, ratio5d, ratio10d };
}

/**
 * Calculate volatility (rolling standard deviation of returns)
 *
 * @param close - Array of closing prices
 * @param window - Rolling window size (default 10)
 * @returns Array of volatility values
 */
function calculateVolatility(close: number[], window: number = 10): number[] {
  const n = close.length;
  const volatility: number[] = [];

  for (let i = 0; i < n; i++) {
    if (i < window) {
      // Not enough data for full window, use available data
      volatility.push(0);
    } else {
      // Calculate returns for the window
      const returns: number[] = [];
      for (let j = i - window + 1; j <= i; j++) {
        if (j > 0) {
          returns.push((close[j] - close[j - 1]) / close[j - 1]);
        }
      }

      // Calculate standard deviation of returns
      const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance =
        returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
      volatility.push(Math.sqrt(variance));
    }
  }

  return volatility;
}

/**
 * Build feature matrix from raw prediction inputs
 *
 * **Phase 6 Update:** Creates 15-feature matrix with three-signal sentiment + availability:
 * [price_ratio_1d, price_ratio_5d, price_ratio_10d, volume, ...eventType(6), aspectScore, mlScore, signalScore, sentimentAvailability, volatility]
 *
 * **Removed:** positive, negative counts (deprecated)
 * **Features:** Price ratios (3), volume (1), eventType (6), aspectScore (1), mlScore (1), signalScore (1), sentimentAvailability (1), volatility (1)
 *
 * @param input - Raw prediction input data
 * @returns Feature matrix (n_samples × 15)
 * @throws Error if input arrays have inconsistent lengths
 *
 * @example
 * ```typescript
 * const input = {
 *   close: [150.0, 151.5, 152.0],
 *   volume: [1000000, 1100000, 1050000],
 *   eventType: ['EARNINGS', 'M&A', 'GENERAL'],
 *   aspectScore: [0.5, -0.3, 0.1],
 *   mlScore: [0.7, -0.2, 0.0],
 *   signalScore: [0.8, 0.6, 0.5]
 * };
 * const features = buildFeatureMatrix(input);
 * // Returns 3×15 matrix
 * ```
 */
export function buildFeatureMatrix(input: PredictionInput): FeatureMatrix {
  const { close, volume, eventType, aspectScore, mlScore, signalScore } = input;

  // Validate input lengths
  const n = close.length;
  if (volume.length !== n) {
    throw new Error(
      `Preprocessing: Inconsistent input lengths. ` +
        `close=${close.length}, volume=${volume.length}`
    );
  }

  // Validate new signal arrays if provided
  if (eventType && eventType.length !== n) {
    throw new Error(
      `Preprocessing: eventType length (${eventType.length}) does not match close length (${n})`
    );
  }
  if (aspectScore && aspectScore.length !== n) {
    throw new Error(
      `Preprocessing: aspectScore length (${aspectScore.length}) does not match close length (${n})`
    );
  }
  if (mlScore && mlScore.length !== n) {
    throw new Error(
      `Preprocessing: mlScore length (${mlScore.length}) does not match close length (${n})`
    );
  }
  if (signalScore && signalScore.length !== n) {
    throw new Error(
      `Preprocessing: signalScore length (${signalScore.length}) does not match close length (${n})`
    );
  }

  if (n === 0) {
    return [];
  }

  // Calculate price ratios
  const { ratio1d, ratio5d, ratio10d } = calculatePriceRatios(close);

  // Calculate volatility
  const volatility = calculateVolatility(close);

  // One-hot encode event types (6 features) or use default GENERAL
  const eventOneHot = eventType
    ? oneHotEncodeEventType(eventType)
    : Array(n)
        .fill(null)
        .map(() => [0, 0, 0, 0, 0, 1]); // Default to GENERAL

  // Use aspect scores or default to 0
  const aspectScores = aspectScore ?? Array(n).fill(0);

  // Use ML scores or fallback to 0
  const mlScores = mlScore ?? Array(n).fill(0);

  // Use signal scores or default to 0.5 (neutral)
  const signalScores = signalScore ?? Array(n).fill(0.5);

  // Calculate sentiment availability (% of days with non-zero mlScore)
  // This is a stock-level metric, same for all rows
  const sentimentAvailability = mlScore
    ? mlScore.filter((s) => s !== null && s !== undefined && s !== 0).length / n
    : 0;

  // Build feature matrix (15 features)
  const features: FeatureMatrix = new Array(n);
  for (let i = 0; i < n; i++) {
    features[i] = [
      ratio1d[i], // price ratio 1-day
      ratio5d[i], // price ratio 5-day
      ratio10d[i], // price ratio 10-day
      volume[i], // volume
      ...eventOneHot[i], // 6 event type features
      aspectScores[i], // aspect score
      mlScores[i], // ML score
      signalScores[i], // signal score (metadata quality)
      sentimentAvailability, // sentiment data availability (0-1)
      volatility[i], // volatility
    ];
  }

  return features;
}

/**
 * Create binary labels for prediction
 *
 * Labels are generated by comparing current price to future price:
 * - 0 if price rises (close[i] <= close[i + horizon])
 * - 1 if price drops (close[i] > close[i + horizon])
 *
 * @param close - Array of closing prices
 * @param horizon - Number of periods ahead to compare (1=next day, 10=2 weeks, 21=1 month)
 * @returns Binary labels (0 or 1) with length = close.length - horizon
 */
export function createLabels(close: number[], horizon: number): Labels {
  if (horizon < 1) {
    throw new Error(`Preprocessing: horizon must be >= 1, got ${horizon}`);
  }

  if (close.length <= horizon) {
    return []; // Not enough data to create any labels
  }

  const labels: Labels = [];

  for (let i = 0; i < close.length - horizon; i++) {
    // Label = 1 if price will drop, 0 if price will rise/stay
    const label = close[i] > close[i + horizon] ? 1 : 0;
    labels.push(label);
  }

  return labels;
}

/**
 * Get the number of features in the feature matrix (Phase 6 update: 14 → 15)
 *
 * Breakdown:
 * - 3 price ratio features (1d, 5d, 10d)
 * - 1 volume feature
 * - 6 event type features (one-hot encoded)
 * - 1 aspect score feature
 * - 1 ML score feature
 * - 1 signal score feature
 * - 1 sentiment availability feature (% of days with sentiment data)
 * - 1 volatility feature
 */
export const FEATURE_COUNT = 15;

/**
 * Get feature names in order (Phase 6 update)
 *
 * **Breakdown:**
 * - 3 price ratio features
 * - 1 volume feature
 * - 6 event type features (one-hot encoded)
 * - 3 sentiment/signal features (aspect + ML + signal)
 * - 1 sentiment availability feature
 * - 1 volatility feature
 */
export const FEATURE_NAMES = [
  'price_ratio_1d',
  'price_ratio_5d',
  'price_ratio_10d',
  'volume',
  'event_earnings',
  'event_ma',
  'event_product',
  'event_analyst',
  'event_guidance',
  'event_general',
  'aspect_score',
  'ml_score',
  'signal_score',
  'sentiment_availability',
  'volatility',
] as const;

/**
 * Validate feature matrix shape
 *
 * @param X - Feature matrix
 * @throws Error if shape is invalid
 */
export function validateFeatureMatrix(X: FeatureMatrix): void {
  if (!X || X.length === 0) {
    throw new Error('Preprocessing: Feature matrix cannot be empty');
  }

  const nFeatures = X[0].length;
  if (nFeatures !== FEATURE_COUNT) {
    throw new Error(
      `Preprocessing: Expected ${FEATURE_COUNT} features, got ${nFeatures}`
    );
  }

  // Check all rows have same number of features
  for (let i = 1; i < X.length; i++) {
    if (X[i].length !== nFeatures) {
      throw new Error(
        `Preprocessing: Inconsistent feature count at row ${i}. ` +
          `Expected ${nFeatures}, got ${X[i].length}`
      );
    }
  }

  // Check for non-finite values
  for (let i = 0; i < X.length; i++) {
    for (let j = 0; j < nFeatures; j++) {
      if (!isFinite(X[i][j])) {
        throw new Error(
          `Preprocessing: Non-finite value at row ${i}, column ${j}: ${X[i][j]}`
        );
      }
    }
  }
}

/**
 * Validate labels
 *
 * @param y - Label array
 * @throws Error if labels are invalid
 */
export function validateLabels(y: Labels): void {
  if (!y || y.length === 0) {
    throw new Error('Preprocessing: Labels cannot be empty');
  }

  for (let i = 0; i < y.length; i++) {
    if (y[i] !== 0 && y[i] !== 1) {
      throw new Error(
        `Preprocessing: Invalid label at index ${i}. ` +
          `Expected 0 or 1, got ${y[i]}`
      );
    }
  }
}

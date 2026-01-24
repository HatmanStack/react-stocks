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
 * Event impact scores (0-1 scale by expected market impact)
 */
const EVENT_IMPACT: Record<string, number> = {
  GENERAL: 0.0,
  PRODUCT_LAUNCH: 0.2,
  ANALYST_RATING: 0.4,
  GUIDANCE: 0.6,
  'M&A': 0.8,
  EARNINGS: 1.0,
};

/**
 * Encode event types as a single impact score (0-1)
 *
 * Replaces 6 one-hot features with a single ordinal feature based on
 * expected market impact magnitude.
 *
 * @param eventTypes - Array of event type strings
 * @returns Array of impact scores (0-1)
 */
export function encodeEventImpact(eventTypes: EventType[]): number[] {
  return eventTypes.map((eventType) => {
    const normalized = eventType ?? 'GENERAL';
    return EVENT_IMPACT[normalized] ?? 0.0;
  });
}

/**
 * One-hot encode sentiment categories (DEPRECATED)
 *
 * @deprecated Use encodeEventImpact instead. This is kept for backward compatibility only.
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
 * Creates 10-feature matrix:
 * [price_ratio_1d, price_ratio_5d, price_ratio_10d, volume, event_impact, aspectScore, mlScore, signalScore, sentimentAvailability, volatility]
 *
 * Features: Price ratios (3), volume (1), event impact (1), aspectScore (1), mlScore (1), signalScore (1), sentimentAvailability (1), volatility (1)
 *
 * @param input - Raw prediction input data
 * @returns Feature matrix (n_samples × 10)
 * @throws Error if input arrays have inconsistent lengths
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

  // Encode event types as single impact score (0-1)
  const eventImpact = eventType
    ? encodeEventImpact(eventType)
    : Array(n).fill(0); // Default to GENERAL (0.0)

  // Use aspect scores or default to 0
  const aspectScores = aspectScore ?? Array(n).fill(0);

  // Calculate sentiment availability BEFORE coalescing nulls
  // null entries = days with no sentiment analysis, 0 is a valid neutral score
  const sentimentAvailability = mlScore
    ? mlScore.filter((s) => s !== null && s !== undefined).length / n
    : 0;

  // Coalesce null mlScores to 0 for feature matrix values
  const mlScores = mlScore
    ? mlScore.map((s) => s ?? 0)
    : Array(n).fill(0) as number[];

  // Use signal scores or default to 0.5 (neutral)
  const signalScores = signalScore ?? Array(n).fill(0.5);

  // Build feature matrix (9 features)
  const features: FeatureMatrix = new Array(n);
  for (let i = 0; i < n; i++) {
    features[i] = [
      ratio5d[i], // price ratio 5-day
      ratio10d[i], // price ratio 10-day
      volume[i], // volume
      eventImpact[i], // event impact score (0-1)
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
 * Build a price-only feature matrix (5 features)
 *
 * Used by the ensemble model as the price-only component.
 * Contains only features derived from price and volume data,
 * independent of sentiment availability.
 *
 * Features: price_ratio_1d, price_ratio_5d, price_ratio_10d, volume, volatility
 */
export function buildPriceOnlyFeatureMatrix(input: PredictionInput): FeatureMatrix {
  const { close, volume } = input;
  const n = close.length;

  if (volume.length !== n) {
    throw new Error(
      `Preprocessing: Inconsistent input lengths. close=${close.length}, volume=${volume.length}`
    );
  }

  if (n === 0) {
    return [];
  }

  const { ratio5d, ratio10d } = calculatePriceRatios(close);
  const vol = calculateVolatility(close);

  const features: FeatureMatrix = new Array(n);
  for (let i = 0; i < n; i++) {
    features[i] = [
      ratio5d[i],
      ratio10d[i],
      volume[i],
      vol[i],
    ];
  }

  return features;
}

/**
 * Rolling window for computing expected returns (trading days).
 * 20 days ≈ 1 month of trading history for baseline trend estimation.
 */
export const TREND_WINDOW = 20;

/**
 * Create binary labels based on abnormal returns.
 *
 * Instead of raw price direction (which just captures trend), labels
 * represent whether the stock outperformed or underperformed its own
 * recent trend. This isolates sentiment-driven movements from momentum.
 *
 * - 0 if actual return >= expected (outperformed trend / sentiment positive)
 * - 1 if actual return < expected (underperformed trend / sentiment negative)
 *
 * @param close - Array of closing prices
 * @param horizon - Number of periods ahead to compare (1=next day, 10=2 weeks, 21=1 month)
 * @returns Binary labels (0 or 1) with length = close.length - horizon - TREND_WINDOW
 */
export function createLabels(close: number[], horizon: number): Labels {
  if (horizon < 1) {
    throw new Error(`Preprocessing: horizon must be >= 1, got ${horizon}`);
  }

  if (close.length <= horizon + TREND_WINDOW) {
    return []; // Not enough data for rolling window + horizon
  }

  const labels: Labels = [];

  for (let i = TREND_WINDOW; i < close.length - horizon; i++) {
    // Calculate rolling mean daily return over the trailing window
    let sumDailyReturns = 0;
    for (let j = i - TREND_WINDOW + 1; j <= i; j++) {
      sumDailyReturns += (close[j] - close[j - 1]) / close[j - 1];
    }
    const meanDailyReturn = sumDailyReturns / TREND_WINDOW;

    // Expected return = trend extrapolation over horizon
    const expectedReturn = meanDailyReturn * horizon;

    // Actual return over the horizon
    const actualReturn = (close[i + horizon] - close[i]) / close[i];

    // Label: 1 if underperformed trend, 0 if outperformed or matched
    const label = actualReturn < expectedReturn ? 1 : 0;
    labels.push(label);
  }

  return labels;
}

/**
 * Number of features in the full feature matrix
 *
 * Breakdown:
 * - 2 price ratio features (5d, 10d)
 * - 1 volume feature
 * - 1 event impact feature (ordinal 0-1)
 * - 1 aspect score feature
 * - 1 ML score feature
 * - 1 signal score feature
 * - 1 sentiment availability feature (% of days with sentiment data)
 * - 1 volatility feature
 */
export const FEATURE_COUNT = 9;

/**
 * Feature names in order
 */
export const FEATURE_NAMES = [
  'price_ratio_5d',
  'price_ratio_10d',
  'volume',
  'event_impact',
  'aspect_score',
  'ml_score',
  'signal_score',
  'sentiment_availability',
  'volatility',
] as const;

/**
 * Price-only feature count (used by ensemble price model)
 */
export const PRICE_ONLY_FEATURE_COUNT = 4;

/**
 * Price-only feature names in order
 */
export const PRICE_ONLY_FEATURE_NAMES = [
  'price_ratio_5d',
  'price_ratio_10d',
  'volume',
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

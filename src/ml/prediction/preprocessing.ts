/**
 * Feature Engineering and Preprocessing
 *
 * Functions for converting raw stock data into feature matrices
 * and labels for logistic regression training.
 *
 * **Phase 4 Update:** Added support for three-signal sentiment architecture
 * (eventType, aspectScore, finBERTScore) increasing feature count from 8 to 14.
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
 * Build feature matrix from raw prediction inputs
 *
 * **Phase 4 Update:** Creates 12-feature matrix with three-signal sentiment:
 * [close, volume, positive, negative, ...eventType(6), aspectScore, finBERTScore]
 *
 * **Legacy (deprecated):** positive, negative counts maintained for backward compatibility
 * **NEW:** eventType (one-hot, 6 features), aspectScore, finBERTScore
 *
 * @param input - Raw prediction input data
 * @returns Feature matrix (n_samples × 12)
 * @throws Error if input arrays have inconsistent lengths
 *
 * @example
 * ```typescript
 * const input = {
 *   close: [150.0, 151.5],
 *   volume: [1000000, 1100000],
 *   positive: [10, 12], // deprecated but required
 *   negative: [2, 3],   // deprecated but required
 *   sentiment: ['POS', 'POS'], // deprecated but required
 *   eventType: ['EARNINGS', 'M&A'],
 *   aspectScore: [0.5, -0.3],
 *   finBERTScore: [0.7, -0.2]
 * };
 * const features = buildFeatureMatrix(input);
 * // Returns 2×12 matrix
 * ```
 */
export function buildFeatureMatrix(input: PredictionInput): FeatureMatrix {
  const {
    close,
    volume,
    positive,
    negative,
    sentiment,
    eventType,
    aspectScore,
    finBERTScore,
  } = input;

  // Validate input lengths
  const n = close.length;
  if (
    volume.length !== n ||
    positive.length !== n ||
    negative.length !== n ||
    sentiment.length !== n
  ) {
    throw new Error(
      `Preprocessing: Inconsistent input lengths. ` +
        `close=${close.length}, volume=${volume.length}, ` +
        `positive=${positive.length}, negative=${negative.length}, ` +
        `sentiment=${sentiment.length}`
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
  if (finBERTScore && finBERTScore.length !== n) {
    throw new Error(
      `Preprocessing: finBERTScore length (${finBERTScore.length}) does not match close length (${n})`
    );
  }

  if (n === 0) {
    return [];
  }

  // One-hot encode event types (6 features) or use default GENERAL
  const eventOneHot = eventType
    ? oneHotEncodeEventType(eventType)
    : Array(n)
        .fill(null)
        .map(() => [0, 0, 0, 0, 0, 1]); // Default to GENERAL

  // Use aspect scores or default to 0
  const aspectScores = aspectScore ?? Array(n).fill(0);

  // Use finBERT scores or fallback to 0
  const finBERTScores = finBERTScore ?? Array(n).fill(0);

  // Build feature matrix (14 features)
  const features: FeatureMatrix = new Array(n);
  for (let i = 0; i < n; i++) {
    features[i] = [
      close[i],
      volume[i],
      positive[i], // deprecated but maintained
      negative[i], // deprecated but maintained
      ...eventOneHot[i], // 6 event type features
      aspectScores[i], // aspect score
      finBERTScores[i], // finBERT score
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
 * Get the number of features in the feature matrix (Phase 4 update: 8 → 12)
 *
 * Breakdown:
 * - 4 base features (close, volume, positive, negative)
 * - 6 event type features (one-hot encoded)
 * - 2 sentiment features (aspect score, finBERT score)
 */
export const FEATURE_COUNT = 12;

/**
 * Get feature names in order (Phase 4 update)
 *
 * **Breakdown:**
 * - 2 price/volume features
 * - 2 legacy sentiment features (deprecated)
 * - 6 event type features (one-hot encoded)
 * - 2 new sentiment features (aspect + finBERT)
 */
export const FEATURE_NAMES = [
  'close',
  'volume',
  'positive', // deprecated
  'negative', // deprecated
  'event_earnings',
  'event_ma',
  'event_product',
  'event_analyst',
  'event_guidance',
  'event_general',
  'aspect_score',
  'finbert_score',
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

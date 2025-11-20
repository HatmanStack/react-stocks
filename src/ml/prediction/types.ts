/**
 * Type definitions for prediction ML models
 */

import type { EventType } from '../../types/database.types';

/**
 * Input data for stock price predictions
 *
 * **Schema Evolution (Phase 4):**
 * - Legacy: positive/negative counts, sentiment category (deprecated)
 * - NEW: eventType (categorical), aspectScore (numerical), finBERTScore (numerical)
 *
 * The new three-signal architecture provides richer sentiment analysis for better predictions.
 */
export interface PredictionInput {
  ticker: string;

  // Price and volume features
  close: number[];
  volume: number[];

  // Legacy sentiment features (DEPRECATED - will be removed in future)
  /** @deprecated Use eventType, aspectScore, finBERTScore instead */
  positive: number[];
  /** @deprecated Use eventType, aspectScore, finBERTScore instead */
  negative: number[];
  /** @deprecated Use eventType instead */
  sentiment: string[]; // "POS", "NEG", "NEUT", "UNKNOWN"

  // NEW (Phase 4): Three-signal sentiment architecture
  /**
   * Event type classification for each observation.
   * Will be one-hot encoded into 6 features in the feature matrix.
   */
  eventType?: EventType[];

  /**
   * Aspect-based sentiment score for each observation.
   * Range: -1 (very negative) to +1 (very positive)
   * Defaults to 0 if not provided.
   */
  aspectScore?: number[];

  /**
   * DistilFinBERT contextual sentiment score for each observation.
   * Range: -1 (very negative) to +1 (very positive)
   * Fallback to legacy sentimentScore if not available.
   */
  finBERTScore?: number[];
}

/**
 * Prediction output for three time horizons
 */
export interface PredictionOutput {
  next: string; // Next day prediction (0=up, 1=down)
  week: string; // 2-week prediction (0=up, 1=down)
  month: string; // 1-month prediction (0=up, 1=down)
  ticker: string;
}

/**
 * Feature matrix (2D array)
 * - Rows: observations
 * - Columns: features
 */
export type FeatureMatrix = number[][];

/**
 * Label array (binary: 0 or 1)
 */
export type Labels = number[];

/**
 * StandardScaler parameters
 */
export interface ScalerParams {
  mean: number[] | null;
  std: number[] | null;
}

/**
 * Training options for logistic regression
 */
export interface TrainingOptions {
  maxIterations?: number;
  learningRate?: number;
  regularization?: number; // L2 regularization strength (C parameter)
  tolerance?: number; // Convergence tolerance
  verbose?: boolean;
}

/**
 * Cross-validation fold
 */
export interface CVFold {
  trainIndices: number[];
  testIndices: number[];
}

/**
 * Cross-validation results
 */
export interface CVResults {
  scores: number[]; // Accuracy score for each fold
  meanScore: number;
  stdScore: number;
}

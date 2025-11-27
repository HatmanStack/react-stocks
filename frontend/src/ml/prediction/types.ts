/**
 * Type definitions for prediction ML models
 */

import type { EventType } from '../../types/database.types';

/**
 * Input data for stock price predictions
 *
 * **Phase 4 Update:**
 * - Price features: close prices (will be converted to price ratios internally)
 * - Volume: normalized volume
 * - Three-signal sentiment: eventType, aspectScore, finBERTScore
 * - Volatility: calculated from close prices
 *
 * The feature matrix will contain 13 features:
 * - 3 price ratios (1d, 5d, 10d)
 * - 1 volume
 * - 6 event type features (one-hot encoded)
 * - 1 aspect score
 * - 1 finBERT score
 * - 1 volatility
 */
export interface PredictionInput {
  ticker: string;

  // Price and volume features (will be transformed internally)
  close: number[]; // Will be converted to price ratios
  volume: number[];

  // Three-signal sentiment architecture
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
   * Defaults to 0 if not provided.
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

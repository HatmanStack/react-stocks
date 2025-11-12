/**
 * Type definitions for prediction ML models
 */

/**
 * Input data for stock price predictions
 */
export interface PredictionInput {
  ticker: string;
  close: number[];
  volume: number[];
  positive: number[];
  negative: number[];
  sentiment: string[]; // "POS", "NEG", "NEUT", "UNKNOWN"
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

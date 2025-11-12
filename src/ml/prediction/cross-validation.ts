/**
 * Cross-Validation Utilities
 *
 * K-Fold cross-validation for model evaluation.
 */

import type { FeatureMatrix, Labels, CVFold, CVResults } from './types';
import { LogisticRegression } from './model';

/**
 * Split data into K sequential folds
 *
 * Matches scikit-learn's KFold with shuffle=False (default)
 * Splits data into k consecutive parts without shuffling.
 *
 * @param nSamples - Number of samples
 * @param k - Number of folds
 * @returns Array of fold splits
 */
export function kFoldSplit(nSamples: number, k: number): CVFold[] {
  if (k < 2) {
    throw new Error(`CV: k must be >= 2, got ${k}`);
  }

  if (k > nSamples) {
    throw new Error(`CV: k=${k} cannot be greater than n_samples=${nSamples}`);
  }

  const folds: CVFold[] = [];
  const foldSize = Math.floor(nSamples / k);

  for (let i = 0; i < k; i++) {
    const testStart = i * foldSize;
    const testEnd = i === k - 1 ? nSamples : (i + 1) * foldSize;

    const testIndices: number[] = [];
    const trainIndices: number[] = [];

    for (let j = 0; j < nSamples; j++) {
      if (j >= testStart && j < testEnd) {
        testIndices.push(j);
      } else {
        trainIndices.push(j);
      }
    }

    folds.push({ trainIndices, testIndices });
  }

  return folds;
}

/**
 * Extract subset of data by indices
 */
function selectByIndices(X: FeatureMatrix, indices: number[]): FeatureMatrix {
  return indices.map((i) => X[i]);
}

/**
 * Extract subset of labels by indices
 */
function selectLabelsByIndices(y: Labels, indices: number[]): Labels {
  return indices.map((i) => y[i]);
}

/**
 * Perform K-fold cross-validation
 *
 * @param model - Logistic regression model (will be re-fitted for each fold)
 * @param X - Feature matrix
 * @param y - Labels
 * @param k - Number of folds
 * @returns Cross-validation results with scores for each fold
 */
export function crossValidate(
  X: FeatureMatrix,
  y: Labels,
  k: number
): CVResults {
  if (X.length !== y.length) {
    throw new Error(`CV: X and y length mismatch. X=${X.length}, y=${y.length}`);
  }

  const folds = kFoldSplit(X.length, k);
  const scores: number[] = [];

  for (let i = 0; i < folds.length; i++) {
    const { trainIndices, testIndices } = folds[i];

    // Extract train and test data
    const X_train = selectByIndices(X, trainIndices);
    const y_train = selectLabelsByIndices(y, trainIndices);
    const X_test = selectByIndices(X, testIndices);
    const y_test = selectLabelsByIndices(y, testIndices);

    // Train model on this fold
    const foldModel = new LogisticRegression();
    foldModel.fit(X_train, y_train, {
      maxIterations: 1000,
      learningRate: 0.01,
      regularization: 1.0,
      tolerance: 1e-4,
    });

    // Evaluate on test set
    const accuracy = foldModel.score(X_test, y_test);
    scores.push(accuracy);
  }

  // Calculate mean and std of scores
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  const variance =
    scores.reduce((sum, score) => sum + Math.pow(score - meanScore, 2), 0) /
    scores.length;
  const stdScore = Math.sqrt(variance);

  return {
    scores,
    meanScore,
    stdScore,
  };
}

/**
 * Logistic Regression with Cross-Validation
 *
 * Performs K-fold CV during training and trains final model on all data.
 * Matches scikit-learn's LogisticRegressionCV behavior.
 */
export class LogisticRegressionCV extends LogisticRegression {
  private cvResults: CVResults | null = null;

  /**
   * Train model with K-fold cross-validation
   *
   * 1. Performs K-fold CV to evaluate model
   * 2. Trains final model on all data
   * 3. Stores CV scores for inspection
   *
   * @param X - Feature matrix
   * @param y - Labels
   * @param k - Number of folds (default: 8)
   */
  fitCV(X: FeatureMatrix, y: Labels, k: number = 8): void {
    if (X.length === 0 || y.length === 0) {
      throw new Error('LogisticRegressionCV: Cannot fit on empty data');
    }

    if (X.length !== y.length) {
      throw new Error(
        `LogisticRegressionCV: X and y length mismatch. X=${X.length}, y=${y.length}`
      );
    }

    // Perform cross-validation
    this.cvResults = crossValidate(X, y, k);

    // Train final model on all data
    super.fit(X, y, {
      maxIterations: 1000,
      learningRate: 0.01,
      regularization: 1.0,
      tolerance: 1e-4,
    });
  }

  /**
   * Get cross-validation results
   */
  getCVResults(): CVResults | null {
    return this.cvResults;
  }

  /**
   * Get cross-validation scores (convenience method)
   */
  getCVScores(): number[] {
    return this.cvResults ? this.cvResults.scores : [];
  }

  /**
   * Get mean cross-validation score (convenience method)
   */
  getMeanCVScore(): number | null {
    return this.cvResults ? this.cvResults.meanScore : null;
  }
}

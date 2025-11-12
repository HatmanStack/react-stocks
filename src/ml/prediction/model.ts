/**
 * Logistic Regression Model
 *
 * Binary classification model using gradient descent optimization.
 * Designed to match scikit-learn's LogisticRegression behavior.
 */

import type { FeatureMatrix, Labels, TrainingOptions } from './types';

/**
 * Sigmoid activation function
 *
 * σ(z) = 1 / (1 + e^(-z))
 *
 * @param z - Input value
 * @returns Value between 0 and 1
 */
export function sigmoid(z: number): number {
  // Handle overflow/underflow
  if (z > 500) return 1.0; // Prevent exp() overflow
  if (z < -500) return 0.0; // exp(-z) would be huge

  return 1 / (1 + Math.exp(-z));
}

/**
 * Logistic Regression Classifier
 *
 * Uses gradient descent with L2 regularization to match scikit-learn.
 */
export class LogisticRegression {
  private weights: number[] | null = null;
  private bias: number = 0;
  private converged: boolean = false;
  private iterations: number = 0;

  /**
   * Train the model using gradient descent
   *
   * @param X - Feature matrix (n_samples × n_features)
   * @param y - Binary labels (0 or 1)
   * @param options - Training hyperparameters
   */
  fit(X: FeatureMatrix, y: Labels, options?: TrainingOptions): void {
    const {
      maxIterations = 1000,
      learningRate = 0.01,
      regularization = 1.0, // C parameter (inverse of regularization strength)
      tolerance = 1e-4,
      verbose = false,
    } = options || {};

    if (X.length === 0 || y.length === 0) {
      throw new Error('LogisticRegression: Cannot fit on empty data');
    }

    if (X.length !== y.length) {
      throw new Error(
        `LogisticRegression: X and y length mismatch. X=${X.length}, y=${y.length}`
      );
    }

    const nSamples = X.length;
    const nFeatures = X[0].length;

    // Initialize weights and bias to zero (scikit-learn default)
    this.weights = new Array(nFeatures).fill(0);
    this.bias = 0;

    // Regularization strength (alpha = 1/C)
    const alpha = 1.0 / regularization;

    let prevLoss = Infinity;
    this.converged = false;

    for (let iter = 0; iter < maxIterations; iter++) {
      // Compute predictions
      const predictions = new Array(nSamples);
      for (let i = 0; i < nSamples; i++) {
        let z = this.bias;
        for (let j = 0; j < nFeatures; j++) {
          z += this.weights[j] * X[i][j];
        }
        predictions[i] = sigmoid(z);
      }

      // Compute gradients
      const weightGradients = new Array(nFeatures).fill(0);
      let biasGradient = 0;

      for (let i = 0; i < nSamples; i++) {
        const error = predictions[i] - y[i];
        biasGradient += error;
        for (let j = 0; j < nFeatures; j++) {
          weightGradients[j] += error * X[i][j];
        }
      }

      // Average gradients and add L2 regularization
      biasGradient /= nSamples;
      for (let j = 0; j < nFeatures; j++) {
        weightGradients[j] = weightGradients[j] / nSamples + alpha * this.weights[j];
      }

      // Update weights and bias
      this.bias -= learningRate * biasGradient;
      for (let j = 0; j < nFeatures; j++) {
        this.weights[j] -= learningRate * weightGradients[j];
      }

      // Compute loss for convergence check
      let loss = 0;
      for (let i = 0; i < nSamples; i++) {
        const p = predictions[i];
        // Binary cross-entropy loss
        loss -= y[i] * Math.log(p + 1e-15) + (1 - y[i]) * Math.log(1 - p + 1e-15);
      }
      loss /= nSamples;

      // Add L2 regularization to loss
      let l2Penalty = 0;
      for (let j = 0; j < nFeatures; j++) {
        l2Penalty += this.weights[j] * this.weights[j];
      }
      loss += (alpha / 2) * l2Penalty;

      if (verbose && (iter % 100 === 0 || iter === maxIterations - 1)) {
        console.log(`[LogisticRegression] Iteration ${iter}: loss=${loss.toFixed(6)}`);
      }

      // Check convergence
      if (Math.abs(prevLoss - loss) < tolerance) {
        this.converged = true;
        this.iterations = iter + 1;
        if (verbose) {
          console.log(`[LogisticRegression] Converged after ${this.iterations} iterations`);
        }
        break;
      }

      prevLoss = loss;
      this.iterations = iter + 1;
    }

    if (!this.converged && verbose) {
      console.warn(`[LogisticRegression] Did not converge after ${maxIterations} iterations`);
    }
  }

  /**
   * Predict class labels (0 or 1)
   *
   * @param X - Feature matrix
   * @returns Binary predictions (0 or 1)
   */
  predict(X: FeatureMatrix): number[] {
    this.checkFitted();

    const probabilities = this.predictProba(X);
    return probabilities.map((probs) => (probs[1] >= 0.5 ? 1 : 0));
  }

  /**
   * Predict class probabilities
   *
   * @param X - Feature matrix
   * @returns Array of [P(y=0), P(y=1)] for each sample
   */
  predictProba(X: FeatureMatrix): number[][] {
    this.checkFitted();

    if (X.length === 0) {
      return [];
    }

    const nFeatures = this.weights!.length;
    const probabilities: number[][] = [];

    for (let i = 0; i < X.length; i++) {
      if (X[i].length !== nFeatures) {
        throw new Error(
          `LogisticRegression: Feature count mismatch. Expected ${nFeatures}, got ${X[i].length}`
        );
      }

      let z = this.bias;
      for (let j = 0; j < nFeatures; j++) {
        z += this.weights![j] * X[i][j];
      }

      const prob1 = sigmoid(z);
      const prob0 = 1 - prob1;

      probabilities.push([prob0, prob1]);
    }

    return probabilities;
  }

  /**
   * Get model parameters
   */
  getParams(): { weights: number[] | null; bias: number; converged: boolean; iterations: number } {
    return {
      weights: this.weights ? [...this.weights] : null,
      bias: this.bias,
      converged: this.converged,
      iterations: this.iterations,
    };
  }

  /**
   * Check if model is fitted
   */
  isFitted(): boolean {
    return this.weights !== null;
  }

  /**
   * Throw error if model not fitted
   */
  private checkFitted(): void {
    if (!this.isFitted()) {
      throw new Error('LogisticRegression: Model not fitted. Call fit() first.');
    }
  }

  /**
   * Compute accuracy score
   *
   * @param X - Feature matrix
   * @param y - True labels
   * @returns Accuracy (fraction of correct predictions)
   */
  score(X: FeatureMatrix, y: Labels): number {
    const predictions = this.predict(X);
    let correct = 0;
    for (let i = 0; i < y.length; i++) {
      if (predictions[i] === y[i]) {
        correct++;
      }
    }
    return correct / y.length;
  }
}

import { ModelTrainingConfig, TrainingMetrics, DailyFeatures, PredictionResult } from '../types/prediction.types';
import { Scaler, normalize_features } from './preprocessing';

/**
 * Sigmoid activation function
 */
function sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
}

/**
 * Pure JS Logistic Regression Model
 */
export interface LogisticRegressionModel {
    weights: number[];
    bias: number;
}

/**
 * Calculates balanced class weights for training.
 * @param labels Array of binary labels (0 or 1).
 * @returns Object mapping class indices to weights.
 */
export function calculateClassWeights(labels: number[]): { 0: number; 1: number } {
    const total = labels.length;
    const count0 = labels.filter(l => l === 0).length;
    const count1 = labels.filter(l => l === 1).length;

    const weight0 = count0 > 0 ? total / (2 * count0) : 1;
    const weight1 = count1 > 0 ? total / (2 * count1) : 1;

    return { 0: weight0, 1: weight1 };
}

/**
 * Predict probability using logistic regression
 */
function predict(features: number[], model: LogisticRegressionModel): number {
    let z = model.bias;
    for (let i = 0; i < features.length; i++) {
        z += features[i] * model.weights[i];
    }
    return sigmoid(z);
}

/**
 * Compute binary cross-entropy loss
 */
function binaryCrossEntropy(yTrue: number, yPred: number): number {
    const epsilon = 1e-15;
    yPred = Math.max(epsilon, Math.min(1 - epsilon, yPred));
    return -(yTrue * Math.log(yPred) + (1 - yTrue) * Math.log(1 - yPred));
}

/**
 * Trains logistic regression using gradient descent
 * @param X Feature matrix (array of feature arrays)
 * @param y Labels (array of 0 or 1)
 * @param config Training configuration
 * @returns Trained model and metrics
 */
export async function trainModel(
    X: number[][],
    y: number[],
    config: ModelTrainingConfig
): Promise<{ model: LogisticRegressionModel; metrics: TrainingMetrics }> {
    const numSamples = X.length;
    const numFeatures = X[0]?.length || 0;

    if (numSamples < 10) {
        throw new Error('Insufficient training data: At least 10 samples required.');
    }

    if (numSamples !== y.length) {
        throw new Error('Shape mismatch: X and y must have same number of rows.');
    }

    if (numFeatures !== config.inputDim) {
        throw new Error(`Feature dimension mismatch: Expected ${config.inputDim} features, got ${numFeatures}`);
    }

    // Check for NaN
    for (let i = 0; i < numSamples; i++) {
        for (let j = 0; j < numFeatures; j++) {
            if (Number.isNaN(X[i][j])) {
                throw new Error('Invalid feature data contains NaN');
            }
        }
        if (Number.isNaN(y[i])) {
            throw new Error('Invalid label data contains NaN');
        }
    }

    // Initialize weights to small random values
    const weights: number[] = Array(numFeatures).fill(0).map(() => (Math.random() - 0.5) * 0.1);
    let bias = 0;

    const classWeights = calculateClassWeights(y);
    const learningRate = config.learningRate;

    let finalLoss = 0;
    let finalAccuracy = 0;

    // Gradient descent
    for (let epoch = 0; epoch < config.epochs; epoch++) {
        let totalLoss = 0;
        let correct = 0;

        // Compute gradients over all samples
        const weightGradients = Array(numFeatures).fill(0);
        let biasGradient = 0;

        for (let i = 0; i < numSamples; i++) {
            const yPred = predict(X[i], { weights, bias });
            const yTrue = y[i];
            const sampleWeight = classWeights[yTrue as 0 | 1];

            // Loss
            totalLoss += binaryCrossEntropy(yTrue, yPred) * sampleWeight;

            // Accuracy
            const predicted = yPred >= 0.5 ? 1 : 0;
            if (predicted === yTrue) correct++;

            // Gradient: dL/dw = (yPred - yTrue) * x * sampleWeight
            const error = (yPred - yTrue) * sampleWeight;
            for (let j = 0; j < numFeatures; j++) {
                weightGradients[j] += error * X[i][j];
            }
            biasGradient += error;
        }

        // Update weights
        for (let j = 0; j < numFeatures; j++) {
            weights[j] -= learningRate * (weightGradients[j] / numSamples);
        }
        bias -= learningRate * (biasGradient / numSamples);

        finalLoss = totalLoss / numSamples;
        finalAccuracy = correct / numSamples;
    }

    return {
        model: { weights, bias },
        metrics: {
            accuracy: finalAccuracy,
            loss: finalLoss,
            epochs: config.epochs
        }
    };
}

/**
 * Generates predictions for 3 time horizons (1, 14, 30 days).
 * @param model Trained logistic regression model.
 * @param scaler Fitted scaler.
 * @param latestFeatures DailyFeatures object for the most recent day.
 * @returns List of 3 PredictionResult objects.
 */
export function generate_predictions(
    model: LogisticRegressionModel,
    scaler: Scaler,
    latestFeatures: DailyFeatures
): PredictionResult[] {
    const horizons = [1, 14, 30];
    const predictions: PredictionResult[] = [];

    // Base features (13 dim)
    const baseFeatures = [
        latestFeatures.open, latestFeatures.high, latestFeatures.low, latestFeatures.close, latestFeatures.volume,
        latestFeatures.event_earnings, latestFeatures.event_ma, latestFeatures.event_guidance, latestFeatures.event_analyst, latestFeatures.event_product, latestFeatures.event_general,
        latestFeatures.aspect_score, latestFeatures.ml_score
    ];

    for (const horizon of horizons) {
        const rawFeatures = [...baseFeatures, horizon];
        const normalizedFeatures = normalize_features([rawFeatures], scaler)[0];

        const probValue = predict(normalizedFeatures, model);

        let direction: 'up' | 'down' = 'down';
        let probability = 0;

        if (probValue >= 0.5) {
            direction = 'up';
            probability = probValue;
        } else {
            direction = 'down';
            probability = 1 - probValue;
        }

        predictions.push({
            direction,
            probability,
            horizon
        });
    }

    return predictions;
}

import * as tf from '@tensorflow/tfjs-node';
import { ModelTrainingConfig, TrainingMetrics, DailyFeatures, PredictionResult } from '../types/prediction.types';
import { Scaler, normalize_features } from './preprocessing';

/**
 * Creates a compiled logistic regression model.
 * @param inputDim Number of input features.
 * @param learningRate Learning rate for the optimizer.
 * @returns Compiled TensorFlow.js Sequential model.
 */
export function createLogisticRegressionModel(inputDim: number, learningRate: number = 0.01): tf.Sequential {
    const model = tf.sequential({
        layers: [
            tf.layers.dense({
                inputShape: [inputDim],
                units: 1,
                activation: 'sigmoid',
                kernelInitializer: 'glorotUniform'
            })
        ]
    });

    model.compile({
        optimizer: tf.train.adam(learningRate),
        loss: 'binaryCrossentropy',
        metrics: ['accuracy']
    });

    return model;
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

    // Avoid division by zero if a class is missing
    const weight0 = count0 > 0 ? total / (2 * count0) : 1;
    const weight1 = count1 > 0 ? total / (2 * count1) : 1;

    return {
        0: weight0,
        1: weight1
    };
}

/**
 * Trains the logistic regression model.
 * @param X Feature matrix (tensor).
 * @param y Label vector (tensor).
 * @param config Training configuration.
 * @returns Promise resolving to trained model and metrics.
 */
export async function trainModel(
    X: tf.Tensor2D,
    y: tf.Tensor2D,
    config: ModelTrainingConfig
): Promise<{ model: tf.Sequential, metrics: TrainingMetrics }> {
    let model: tf.Sequential | null = null;

    try {
        const numSamples = X.shape[0];
        if (numSamples < 10) {
            throw new Error('Insufficient training data: At least 10 samples required.');
        }

        if (X.shape[0] !== y.shape[0]) {
            throw new Error('Shape mismatch: X and y must have same number of rows.');
        }

        // Check for NaN in input features
        const xData = await X.data();
        for (let i = 0; i < xData.length; i++) {
            if (Number.isNaN(xData[i])) {
                throw new Error('Invalid feature data contains NaN');
            }
        }

        // Check for NaN in labels
        const yData = await y.data();
        for (let i = 0; i < yData.length; i++) {
            if (Number.isNaN(yData[i])) {
                throw new Error('Invalid label data contains NaN');
            }
        }

        model = createLogisticRegressionModel(config.inputDim, config.learningRate);

        const yArray = await y.array() as number[][];
        const flatLabels = yArray.flat();
        const classWeights = calculateClassWeights(flatLabels);

        let finalAccuracy = 0;
        let finalLoss = 0;

        await model.fit(X, y, {
            epochs: config.epochs,
            batchSize: config.batchSize,
            validationSplit: config.validationSplit,
            classWeight: classWeights,
            verbose: 0,
            callbacks: {
                onEpochEnd: (_epoch: number, logs?: tf.Logs) => {
                    // Keep track of latest metrics
                    if (logs) {
                        finalLoss = logs.loss || 0;
                        finalAccuracy = logs.accuracy || 0;
                    }
                }
            }
        });

        return {
            model,
            metrics: {
                accuracy: finalAccuracy,
                loss: finalLoss,
                epochs: config.epochs
            }
        };
    } catch (error) {
        // Dispose model if it was created before error
        if (model) {
            model.dispose();
        }
        throw error;
    }
}

/**
 * Validates the model against provided data.
 * @param model Trained model.
 * @param X Validation features.
 * @param y Validation labels.
 * @returns Metrics object.
 */
export async function validateModel(
    model: tf.Sequential,
    X: tf.Tensor2D,
    y: tf.Tensor2D
): Promise<TrainingMetrics> {
    const evaluation = model.evaluate(X, y) as tf.Scalar[];

    const loss = await evaluation[0].data();
    const accuracy = await evaluation[1].data();

    // Cleanup evaluation tensors
    evaluation.forEach(t => t.dispose());

    return {
        accuracy: accuracy[0],
        loss: loss[0],
        epochs: 0 // Not applicable for validation
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
    model: tf.Sequential,
    scaler: Scaler,
    latestFeatures: DailyFeatures
): PredictionResult[] {
    const horizons = [1, 14, 30];
    const predictions: PredictionResult[] = [];

    // Base features (13 dim)
    const baseFeatures = [
        latestFeatures.open, latestFeatures.high, latestFeatures.low, latestFeatures.close, latestFeatures.volume,
        latestFeatures.event_earnings, latestFeatures.event_ma, latestFeatures.event_guidance, latestFeatures.event_analyst, latestFeatures.event_product, latestFeatures.event_general,
        latestFeatures.aspect_score, latestFeatures.finbert_score
    ];

    tf.tidy(() => {
        for (const horizon of horizons) {
            // Append horizon to create 14-dim feature vector
            // Note: Feature order must match training. Training data prep was modified implicitly?
            // Wait, Task 8 `prepare_training_data` used 13 features.
            // Task 9 `trainModel` uses inputDim from config.
            // Task 10 instructions say: "For each horizon in [1, 14, 30]: Create feature vector: [base_features..., horizon] (14 total)"
            // AND Phase 0 ADR-2: "Feature vector includes horizon as 14th feature".

            // *** CRITICAL CORRECTION ***
            // My Task 8 implementation of `prepare_training_data` ONLY extracted 13 features.
            // It missed the 'horizon' feature because `DailyFeatures` struct doesn't have it per row naturally unless we augment it.
            // Or `prepare_training_data` should generate multiple samples per day (one for each horizon) OR assume fixed horizon.
            // The plan says: "Feature vector includes horizon as 14th feature (values: 1, 14, 30)".
            // "Training data includes examples for all three horizons".

            // This implies that `prepare_training_data` should have exploded the data 3x, adding horizon feature and using corresponding labels.
            // BUT `DailyFeatures` has only ONE label.
            // ADR-4 says: "Labeling Logic: same-day price movement".
            // "Consistent Labeling: All three horizons share the same labeling logic (same-day movement)".
            // This means for a given historical day, the label is the same regardless of "horizon" feature value?
            // That sounds weird. If horizon is an input, it should predict different things (e.g. 1 day return vs 30 day return).
            // BUT ADR-2 says: "Training data includes examples for all three horizons... Labeling Logic: same-day price movement".
            // This implies we train the model to predict "same-day movement" given "features + horizon X".
            // If the label is ALWAYS same-day movement, then "horizon" feature is irrelevant to the label?
            // Unless "horizon" is just a feature that the model learns to ignore or use?
            // Wait, ADR-2: "Train one logistic regression model with horizon (1, 14, 30 days) as an input feature... running inference three times... to generate three predictions."
            // "Model output: 3 pairs of (direction, probability)".

            // If the label is always "Next Day Direction" (same-day labeling), then training with horizon=30 and label=NextDay seems wrong if we want it to predict 30 days out.
            // HOWEVER, ADR-4 says "All three horizons share the same labeling logic (same-day movement)".
            // This strongly suggests the model is predicting SHORT TERM movement, but we pass different horizon integers as if they are features.
            // This is a bit unusual ML design (passing desired horizon as input but training on fixed target), but I must follow the plan.
            // Maybe the idea is that the model learns "how does market react given we are looking at X horizon context"?
            // Or maybe I misunderstood "same-day labeling".
            // "Label training examples using same-day price movements... not look-ahead labeling."
            // "Model learns same-day market reactions to news."

            // Okay, I will stick to the plan.
            // I need to update `prepare_training_data` (in preprocessing.ts) to include the horizon feature.
            // Since the label is same for all horizons (based on that day's move), for each historical day, we should probably add 3 samples?
            // One with horizon=1, one with 14, one with 30? All with same label?
            // If we do that, the model learns that 'horizon' feature is uncorrelated with the label (since label is same for all 3 horizons).
            // Then during inference, changing horizon value won't change prediction much.
            // This seems like a flaw in the plan or my understanding.

            // Alternative: Maybe "same-day labeling" means we use the price change over the *horizon*?
            // "Labeling Logic: price_change = (close_today - close_yesterday)... IF price_change > 1%...".
            // This is explicitly 1-day change.

            // Re-reading ADR-2 Rationale: "Model learns cross-horizon patterns (early indicators of long-term trends)".
            // If label is always 1-day, how does it learn long term?
            // Unless... I am overthinking and should just follow instructions.
            // Instructions for Task 10: "Run model 3 times with horizon values 1, 14, 30".

            // I will assume `prepare_training_data` SHOULD have added the horizon.
            // Since I missed it in Task 8, I need to fix Task 8 code (`preprocessing.ts`) first or handle it here.
            // But `prepare_training_data` is used for training.
            // If I change `prepare_training_data` to output 14 features, I must ensure it generates the right data.
            // If the plan implies "Training data includes examples for all three horizons", then for each day, I should probably generate 3 rows:
            // [features, 1] -> label
            // [features, 14] -> label
            // [features, 30] -> label
            // Yes, even if label is identical, this puts 'horizon' into the feature space.
            // (Ideally label would differ per horizon, but ADR-4 says same label).

            // So, I will:
            // 1. Update `prepare_training_data` in `preprocessing.ts` to augment data with horizons.
            // 2. Update `generate_predictions` here to match that 14-dim shape.

            // But wait, I am in the middle of editing `mlModel.ts`.
            // I will finish `generate_predictions` assuming 14 features.

            const rawFeatures = [...baseFeatures, horizon];
            const featureTensor = tf.tensor2d([rawFeatures]);

            // Normalize
            // Note: We need the scaler to handle 14 features too!
            // So `create_scaler` must have seen 14-feature data.
            const normalizedFeatures = normalize_features(featureTensor, scaler);

            const predictionTensor = model.predict(normalizedFeatures) as tf.Tensor;
            const probValue = predictionTensor.dataSync()[0];

            // Map to direction/probability
            // Sigmoid output is probability of class 1 (up)
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
    });

    return predictions;
}

import { DailyFeatures } from '../types/prediction.types';
import * as tf from '@tensorflow/tfjs-node';

export interface Scaler {
    mean: tf.Tensor1D;
    std: tf.Tensor1D;
}

/**
 * Extracts feature matrix X and label vector y from DailyFeatures.
 * Filters out rows where label is null (noise exclusion).
 * Augments data with 'horizon' feature (values 1, 14, 30) for each sample.
 *
 * Feature Order (14 features):
 * 1-5: open, high, low, close, volume
 * 6-11: earnings, ma, guidance, analyst, product, general
 * 12: aspect_score
 * 13: finbert_score
 * 14: horizon
 *
 * @param dailyFeatures List of daily features.
 * @returns Tuple [X, y] as Tensors.
 */
export function prepare_training_data(dailyFeatures: DailyFeatures[]): { X: tf.Tensor2D, y: tf.Tensor2D } {
    const validFeatures = dailyFeatures.filter(f => f.label !== null);

    if (validFeatures.length === 0) {
        throw new Error('No valid training data available (all labels are null).');
    }

    const X_array: number[][] = [];
    const y_array: number[][] = [];

    const horizons = [1, 14, 30];

    // Explode each daily feature into 3 samples, one for each horizon
    for (const f of validFeatures) {
        const baseFeatures = [
            f.open, f.high, f.low, f.close, f.volume,
            f.event_earnings, f.event_ma, f.event_guidance, f.event_analyst, f.event_product, f.event_general,
            f.aspect_score, f.finbert_score
        ];

        for (const horizon of horizons) {
            X_array.push([...baseFeatures, horizon]);
            y_array.push([f.label!]);
        }
    }

    return tf.tidy(() => {
        const X = tf.tensor2d(X_array);
        const y = tf.tensor2d(y_array);
        return { X, y };
    });
}

/**
 * Creates a StandardScaler (mean, std) from the input tensor X.
 * @param X Feature matrix (N x features).
 * @returns Scaler object containing mean and std tensors.
 */
export function create_scaler(X: tf.Tensor2D): Scaler {
    return tf.tidy(() => {
        const moments = tf.moments(X, 0);
        const mean = moments.mean;
        const variance = moments.variance;
        const std = tf.sqrt(variance).add(tf.scalar(1e-8)); // Add epsilon to avoid division by zero
        return {
            mean: mean as tf.Tensor1D,
            std: std as tf.Tensor1D
        };
    });
}

/**
 * Normalizes features using the provided scaler.
 * Formula: (X - mean) / std
 * @param X Feature matrix.
 * @param scaler Scaler object.
 * @returns Normalized feature matrix.
 */
export function normalize_features(X: tf.Tensor2D, scaler: Scaler): tf.Tensor2D {
    return tf.tidy(() => {
        return X.sub(scaler.mean).div(scaler.std) as tf.Tensor2D;
    });
}

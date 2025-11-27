import { prepare_training_data, create_scaler, normalize_features } from '../../../backend/src/services/preprocessing';
import { DailyFeatures } from '../../../backend/src/types/prediction.types';
import * as tf from '@tensorflow/tfjs-node';

describe('Preprocessing Service', () => {
    const mockFeatures: DailyFeatures[] = [
        {
            date: '2023-01-01', ticker: 'AAPL', label: 1,
            open: 100, high: 110, low: 90, close: 105, volume: 1000,
            event_earnings: 1, event_ma: 0, event_guidance: 0, event_analyst: 0, event_product: 0, event_general: 0,
            aspect_score: 0.5, finbert_score: 0.8
        },
        {
            date: '2023-01-02', ticker: 'AAPL', label: 0,
            open: 105, high: 115, low: 100, close: 100, volume: 1500,
            event_earnings: 0, event_ma: 1, event_guidance: 0, event_analyst: 0, event_product: 0, event_general: 0,
            aspect_score: -0.5, finbert_score: -0.8
        },
        {
            date: '2023-01-03', ticker: 'AAPL', label: null, // Should be filtered out
            open: 100, high: 100, low: 100, close: 100, volume: 1000,
            event_earnings: 0, event_ma: 0, event_guidance: 0, event_analyst: 0, event_product: 0, event_general: 0,
            aspect_score: 0, finbert_score: 0
        }
    ];

    afterEach(() => {
        // Clean up all tensors
        // Note: in real app we manually dispose, but here we rely on auto-gc or explicit dispose in tests
    });

    describe('prepare_training_data', () => {
        it('should extract X and y correctly and filter null labels', () => {
            const { X, y } = prepare_training_data(mockFeatures);

            // Now we augment data by 3 horizons per sample.
            // 2 valid samples * 3 horizons = 6 samples total
            // 14 features (13 base + 1 horizon)
            expect(X.shape).toEqual([6, 14]);
            expect(y.shape).toEqual([6, 1]);

            const yData = y.dataSync();
            // Each sample replicated 3 times
            // Sample 1 (Label 1) -> 3 times
            // Sample 2 (Label 0) -> 3 times
            expect(yData[0]).toBe(1);
            expect(yData[1]).toBe(1);
            expect(yData[2]).toBe(1);
            expect(yData[3]).toBe(0);
            expect(yData[4]).toBe(0);
            expect(yData[5]).toBe(0);

            // Check horizon values for first sample set
            const xData = X.arraySync() as number[][];
            // Horizon is last feature (index 13)
            expect(xData[0][13]).toBe(1);
            expect(xData[1][13]).toBe(14);
            expect(xData[2][13]).toBe(30);

            X.dispose();
            y.dispose();
        });

        it('should throw error if no valid data', () => {
            const invalidFeatures = [mockFeatures[2]]; // Only the null label one
            expect(() => prepare_training_data(invalidFeatures)).toThrow('No valid training data');
        });
    });

    describe('create_scaler and normalize_features', () => {
        it('should normalize features to mean 0 and std 1 (approx)', () => {
            const { X, y } = prepare_training_data(mockFeatures);
            const scaler = create_scaler(X);
            const X_norm = normalize_features(X, scaler);

            // Calculate mean and std of normalized data
            const mean = tf.moments(X_norm, 0).mean.dataSync();
            const std = tf.sqrt(tf.moments(X_norm, 0).variance).dataSync();

            // Check first feature (open)
            expect(mean[0]).toBeCloseTo(0, 5);
            expect(std[0]).toBeCloseTo(1, 5);

            X.dispose();
            y.dispose();
            scaler.mean.dispose();
            scaler.std.dispose();
            X_norm.dispose();
        });

        it('should handle constant features (zero variance)', () => {
            // event_guidance is 0 for both samples.
            // Variance is 0. Std should be epsilon (1e-8).
            // (0 - 0) / epsilon = 0.
            const { X, y } = prepare_training_data(mockFeatures);
            const scaler = create_scaler(X);
            const X_norm = normalize_features(X, scaler);

            const normData = X_norm.arraySync() as number[][];
            // Index 7 is event_guidance
            expect(normData[0][7]).toBe(0);
            expect(normData[1][7]).toBe(0);

            X.dispose();
            y.dispose();
            scaler.mean.dispose();
            scaler.std.dispose();
            X_norm.dispose();
        });
    });
});

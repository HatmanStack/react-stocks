import { generate_predictions, createLogisticRegressionModel } from '../../src/services/mlModel';
import { create_scaler } from '../../src/services/preprocessing';
import { DailyFeatures } from '../../src/types/prediction.types';
import * as tf from '@tensorflow/tfjs-node';

describe('Prediction Generation', () => {

    // Create a dummy scaler trained on some data
    const X_train = tf.tensor2d([[1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1], [2, 2, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 0, 30]]);
    const scaler = create_scaler(X_train);

    const mockDailyFeatures: DailyFeatures = {
        date: '2023-01-01', ticker: 'AAPL', label: null,
        open: 100, high: 110, low: 90, close: 105, volume: 1000,
        event_earnings: 1, event_ma: 0, event_guidance: 0, event_analyst: 0, event_product: 0, event_general: 0,
        aspect_score: 0.5, finbert_score: 0.8
    };

    it('should generate 3 predictions with correct horizons', () => {
        const model = createLogisticRegressionModel(14);

        const predictions = generate_predictions(model, scaler, mockDailyFeatures);

        expect(predictions).toHaveLength(3);
        expect(predictions[0].horizon).toBe(1);
        expect(predictions[1].horizon).toBe(14);
        expect(predictions[2].horizon).toBe(30);

        expect(['up', 'down']).toContain(predictions[0].direction);
        expect(predictions[0].probability).toBeGreaterThanOrEqual(0);
        expect(predictions[0].probability).toBeLessThanOrEqual(1);

        model.dispose();
        // Scaler cleanup
        scaler.mean.dispose();
        scaler.std.dispose();
        X_train.dispose();
    });
});

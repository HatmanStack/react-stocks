import { fetchHistoricalData } from './dataFetcher';
import { aggregate_daily_features } from './featureEngineering';
import { prepare_training_data, create_scaler, normalize_features } from './preprocessing';
import { trainModel, generate_predictions } from './mlModel';
import { PredictionResult, MODEL_CONFIG } from '../types/prediction.types';
import * as tf from '@tensorflow/tfjs-node';

/**
 * Runs the full prediction pipeline for a given ticker.
 * @param ticker Stock ticker symbol.
 * @param days Number of historical days to fetch (default 90).
 * @returns List of predictions for 1, 14, 30 days.
 */
export async function runPredictionPipeline(ticker: string, days: number = 90): Promise<PredictionResult[]> {
    console.log(`[Pipeline] Starting prediction pipeline for ${ticker} with ${days} days history...`);

    let X: tf.Tensor2D | null = null;
    let y: tf.Tensor2D | null = null;
    let X_norm: tf.Tensor2D | null = null;
    let scaler: { mean: tf.Tensor1D; std: tf.Tensor1D } | null = null;
    let model: tf.Sequential | null = null;

    try {
        // 1. Fetch Data
        const historicalData = await fetchHistoricalData(ticker, days);
        console.log(`[Pipeline] Fetched ${historicalData.prices.length} price records and ${historicalData.sentiment.length} articles.`);

        // 2. Feature Engineering
        const dailyFeatures = aggregate_daily_features(historicalData.prices, historicalData.sentiment, ticker);
        console.log(`[Pipeline] Aggregated ${dailyFeatures.length} daily feature records.`);

        // 3. Preprocessing (Training Data)
        // Note: This now generates 3 samples per day (one for each horizon)
        const trainingData = prepare_training_data(dailyFeatures);
        X = trainingData.X;
        y = trainingData.y;
        console.log(`[Pipeline] Prepared training data: ${X.shape} samples.`);

        // 4. Normalization
        scaler = create_scaler(X);
        X_norm = normalize_features(X, scaler);

        // 5. Model Training
        const trainingResult = await trainModel(X_norm, y, {
            inputDim: MODEL_CONFIG.inputDim,
            learningRate: MODEL_CONFIG.learningRate,
            epochs: MODEL_CONFIG.epochs,
            batchSize: MODEL_CONFIG.batchSize,
            validationSplit: MODEL_CONFIG.validationSplit
        });
        model = trainingResult.model;
        console.log(`[Pipeline] Model trained. Accuracy: ${trainingResult.metrics.accuracy.toFixed(4)}, Loss: ${trainingResult.metrics.loss.toFixed(4)}`);

        // 6. Prediction Generation
        // Use the latest available day for prediction
        const latestFeatures = dailyFeatures[dailyFeatures.length - 1];
        const predictions = generate_predictions(model, scaler, latestFeatures);
        console.log(`[Pipeline] Generated ${predictions.length} predictions.`);

        return predictions;

    } catch (error) {
        console.error(`[Pipeline] Error in prediction pipeline for ${ticker}:`, error);
        throw error;
    } finally {
        // Cleanup tensors and model
        X?.dispose();
        y?.dispose();
        X_norm?.dispose();
        scaler?.mean?.dispose();
        scaler?.std?.dispose();
        model?.dispose();
    }
}

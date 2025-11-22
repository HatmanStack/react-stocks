import { fetchHistoricalData } from './dataFetcher';
import { aggregate_daily_features } from './featureEngineering';
import { prepare_training_data, create_scaler, normalize_features } from './preprocessing';
import { trainModel, generate_predictions, validateModel } from './mlModel';
import { PredictionResult, MODEL_CONFIG, DailyFeatures } from '../types/prediction.types';
import * as tf from '@tensorflow/tfjs-node';

/**
 * Runs the full prediction pipeline for a given ticker.
 * @param ticker Stock ticker symbol.
 * @param days Number of historical days to fetch (default 90).
 * @returns List of predictions for 1, 14, 30 days.
 */
export async function runPredictionPipeline(ticker: string, days: number = 90): Promise<PredictionResult[]> {
    console.log(`[Pipeline] Starting prediction pipeline for ${ticker} with ${days} days history...`);

    try {
        // 1. Fetch Data
        const historicalData = await fetchHistoricalData(ticker, days);
        console.log(`[Pipeline] Fetched ${historicalData.prices.length} price records and ${historicalData.sentiment.length} articles.`);

        // 2. Feature Engineering
        const dailyFeatures = aggregate_daily_features(historicalData.prices, historicalData.sentiment);
        console.log(`[Pipeline] Aggregated ${dailyFeatures.length} daily feature records.`);

        // 3. Preprocessing (Training Data)
        // Note: This now generates 3 samples per day (one for each horizon)
        const { X, y } = prepare_training_data(dailyFeatures);
        console.log(`[Pipeline] Prepared training data: ${X.shape} samples.`);

        // 4. Normalization
        const scaler = create_scaler(X);
        const X_norm = normalize_features(X, scaler);

        // 5. Model Training
        const { model, metrics } = await trainModel(X_norm, y, {
            inputDim: MODEL_CONFIG.inputDim,
            learningRate: MODEL_CONFIG.learningRate,
            epochs: MODEL_CONFIG.epochs,
            batchSize: MODEL_CONFIG.batchSize,
            validationSplit: MODEL_CONFIG.validationSplit
        });
        console.log(`[Pipeline] Model trained. Accuracy: ${metrics.accuracy.toFixed(4)}, Loss: ${metrics.loss.toFixed(4)}`);

        // 6. Prediction Generation
        // Use the latest available day for prediction
        const latestFeatures = dailyFeatures[dailyFeatures.length - 1];
        const predictions = generate_predictions(model, scaler, latestFeatures);
        console.log(`[Pipeline] Generated ${predictions.length} predictions.`);

        // Cleanup
        X.dispose();
        y.dispose();
        X_norm.dispose();
        scaler.mean.dispose();
        scaler.std.dispose();
        model.dispose();

        return predictions;

    } catch (error) {
        console.error(`[Pipeline] Error in prediction pipeline for ${ticker}:`, error);
        throw error;
    }
}

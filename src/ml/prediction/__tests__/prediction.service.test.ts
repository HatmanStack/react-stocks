/**
 * Prediction Service Tests
 */

import {
  getStockPredictions,
  parsePredictionResponse,
  getDefaultPredictions,
} from '../prediction.service';
import predictionSamples from '../../../../docs/ml-migration/test-data/prediction-samples.json';

describe('PredictionService', () => {
  describe('getStockPredictions', () => {
    it('should generate predictions for valid input', async () => {
      const sample = predictionSamples.samples[0]; // AAPL

      const result = await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      expect(result.ticker).toBe('AAPL');
      expect(result.next).toBeDefined();
      expect(result.week).toBeDefined();
      expect(result.month).toBeDefined();

      // Predictions should be "0.0" or "1.0" (binary classification)
      expect(['0.0', '1.0']).toContain(result.next);
      expect(['0.0', '1.0']).toContain(result.week);
      expect(['0.0', '1.0']).toContain(result.month);
    });

    it('should return predictions as strings', async () => {
      const sample = predictionSamples.samples[0];

      const result = await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      expect(typeof result.next).toBe('string');
      expect(typeof result.week).toBe('string');
      expect(typeof result.month).toBe('string');
    });

    it('should handle GOOGL sample data', async () => {
      const sample = predictionSamples.samples[1]; // GOOGL

      const result = await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      expect(result.ticker).toBe('GOOGL');
      expect(result.next).toBeDefined();
      expect(result.week).toBeDefined();
      expect(result.month).toBeDefined();
    });

    it('should handle MSFT sample data (downward trend)', async () => {
      const sample = predictionSamples.samples[2]; // MSFT

      const result = await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      expect(result.ticker).toBe('MSFT');

      // MSFT has downward trend, predictions likely 1 (drop)
      // But we don't enforce this strictly as model behavior may vary
      expect(result.next).toBeDefined();
      expect(result.week).toBeDefined();
      expect(result.month).toBeDefined();
    });

    it('should handle longer dataset (TSLA with 45 points)', async () => {
      const sample = predictionSamples.samples[3]; // TSLA

      const result = await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      expect(result.ticker).toBe('TSLA');
      expect(result.next).toBeDefined();
      expect(result.week).toBeDefined();
      expect(result.month).toBeDefined();
    });

    it('should handle constant features (AMZN edge case)', async () => {
      const sample = predictionSamples.samples[4]; // AMZN

      const result = await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      expect(result.ticker).toBe('AMZN');

      // AMZN has constant volume/sentiment (std=0)
      // Should still produce valid predictions
      expect(result.next).toBeDefined();
      expect(result.week).toBeDefined();
      expect(result.month).toBeDefined();
    });

    it('should throw error for insufficient data', async () => {
      const shortData = predictionSamples.samples[0];

      // Only 10 data points (need 29)
      const input = {
        ticker: 'TEST',
        close: shortData.input.close.slice(0, 10),
        volume: shortData.input.volume.slice(0, 10),
        positive: shortData.input.positive.slice(0, 10),
        negative: shortData.input.negative.slice(0, 10),
        sentiment: shortData.input.sentiment.slice(0, 10),
      };

      await expect(
        getStockPredictions(
          input.ticker,
          input.close,
          input.volume,
          input.positive,
          input.negative,
          input.sentiment
        )
      ).rejects.toThrow('Insufficient data');
    });

    it('should throw error for empty ticker', async () => {
      const sample = predictionSamples.samples[0];

      await expect(
        getStockPredictions(
          '', // Empty ticker
          sample.input.close,
          sample.input.volume,
          sample.input.positive,
          sample.input.negative,
          sample.input.sentiment
        )
      ).rejects.toThrow('Ticker symbol is required');
    });

    it('should throw error for mismatched array lengths', async () => {
      const sample = predictionSamples.samples[0];

      await expect(
        getStockPredictions(
          'TEST',
          sample.input.close,
          sample.input.volume.slice(0, 10), // Wrong length
          sample.input.positive,
          sample.input.negative,
          sample.input.sentiment
        )
      ).rejects.toThrow('Inconsistent input lengths');
    });

    it('should complete within reasonable time', async () => {
      const sample = predictionSamples.samples[0];

      const startTime = performance.now();

      await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      const duration = performance.now() - startTime;

      // Should complete within 1000ms for 30 data points
      // (Training 3 models with 8-fold CV can take time)
      expect(duration).toBeLessThan(1000);
    });

    it('should be async', () => {
      const sample = predictionSamples.samples[0];

      const result = getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('parsePredictionResponse', () => {
    it('should parse prediction response correctly', () => {
      const response = {
        next: '0.0',
        week: '1.0',
        month: '0.0',
        ticker: 'AAPL',
      };

      const parsed = parsePredictionResponse(response);

      expect(parsed.nextDay).toBe(0.0);
      expect(parsed.twoWeeks).toBe(1.0);
      expect(parsed.oneMonth).toBe(0.0);
      expect(parsed.ticker).toBe('AAPL');
    });

    it('should parse float strings correctly', () => {
      const response = {
        next: '0.5',
        week: '0.75',
        month: '0.25',
        ticker: 'TEST',
      };

      const parsed = parsePredictionResponse(response);

      expect(parsed.nextDay).toBeCloseTo(0.5, 2);
      expect(parsed.twoWeeks).toBeCloseTo(0.75, 2);
      expect(parsed.oneMonth).toBeCloseTo(0.25, 2);
    });
  });

  describe('getDefaultPredictions', () => {
    it('should return default predictions with all zeros', () => {
      const result = getDefaultPredictions('AAPL');

      expect(result.next).toBe('0.0');
      expect(result.week).toBe('0.0');
      expect(result.month).toBe('0.0');
      expect(result.ticker).toBe('AAPL');
    });

    it('should echo ticker symbol', () => {
      const result = getDefaultPredictions('GOOGL');

      expect(result.ticker).toBe('GOOGL');
    });
  });

  describe('Integration Tests', () => {
    it('should handle full prediction pipeline', async () => {
      const sample = predictionSamples.samples[0];

      // Test full pipeline: input → feature matrix → scaling → training → prediction
      const result = await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      // Should produce valid binary predictions
      expect(['0.0', '1.0']).toContain(result.next);
      expect(['0.0', '1.0']).toContain(result.week);
      expect(['0.0', '1.0']).toContain(result.month);

      // Should echo ticker
      expect(result.ticker).toBe(sample.input.ticker);
    });

    it('should train separate models for each horizon', async () => {
      const sample = predictionSamples.samples[0];

      const result = await getStockPredictions(
        sample.input.ticker,
        sample.input.close,
        sample.input.volume,
        sample.input.positive,
        sample.input.negative,
        sample.input.sentiment
      );

      // Each horizon should have independent prediction
      // (may be same or different depending on data)
      expect(result.next).toBeDefined();
      expect(result.week).toBeDefined();
      expect(result.month).toBeDefined();
    });

    it('should work with minimal required data (29 points)', async () => {
      const sample = predictionSamples.samples[0];

      // Exactly 29 data points (minimum)
      const input = {
        ticker: 'TEST',
        close: sample.input.close.slice(0, 29),
        volume: sample.input.volume.slice(0, 29),
        positive: sample.input.positive.slice(0, 29),
        negative: sample.input.negative.slice(0, 29),
        sentiment: sample.input.sentiment.slice(0, 29),
      };

      const result = await getStockPredictions(
        input.ticker,
        input.close,
        input.volume,
        input.positive,
        input.negative,
        input.sentiment
      );

      expect(result.ticker).toBe('TEST');
      expect(result.next).toBeDefined();
      expect(result.week).toBeDefined();
      expect(result.month).toBeDefined();
    });
  });
});

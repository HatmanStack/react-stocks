/**
 * Feature Engineering and Preprocessing Tests
 */

import {
  oneHotEncode,
  buildFeatureMatrix,
  buildPriceOnlyFeatureMatrix,
  createLabels,
  validateFeatureMatrix,
  validateLabels,
  FEATURE_COUNT,
  FEATURE_NAMES,
  PRICE_ONLY_FEATURE_COUNT,
  PRICE_ONLY_FEATURE_NAMES,
} from '../preprocessing';
import type { PredictionInput } from '../types';

describe('Preprocessing', () => {
  describe('oneHotEncode', () => {
    it('should encode POS sentiment correctly', () => {
      const result = oneHotEncode(['POS']);
      expect(result).toEqual([[1, 0, 0, 0]]);
    });

    it('should encode NEG sentiment correctly', () => {
      const result = oneHotEncode(['NEG']);
      expect(result).toEqual([[0, 1, 0, 0]]);
    });

    it('should encode NEUT sentiment correctly', () => {
      const result = oneHotEncode(['NEUT']);
      expect(result).toEqual([[0, 0, 1, 0]]);
    });

    it('should encode NEUTRAL as NEUT', () => {
      const result = oneHotEncode(['NEUTRAL']);
      expect(result).toEqual([[0, 0, 1, 0]]);
    });

    it('should encode unknown sentiment as UNKNOWN', () => {
      const result = oneHotEncode(['INVALID']);
      expect(result).toEqual([[0, 0, 0, 1]]);
    });

    it('should handle empty string as UNKNOWN', () => {
      const result = oneHotEncode(['']);
      expect(result).toEqual([[0, 0, 0, 1]]);
    });

    it('should handle mixed sentiments', () => {
      const result = oneHotEncode(['POS', 'NEG', 'NEUT', 'OTHER']);
      expect(result).toEqual([
        [1, 0, 0, 0], // POS
        [0, 1, 0, 0], // NEG
        [0, 0, 1, 0], // NEUT
        [0, 0, 0, 1], // OTHER (unknown)
      ]);
    });

    it('should be case-insensitive', () => {
      const result = oneHotEncode(['pos', 'Neg', 'NEUT']);
      expect(result).toEqual([
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
      ]);
    });

    it('should trim whitespace', () => {
      const result = oneHotEncode([' POS ', '  NEG  ']);
      expect(result).toEqual([
        [1, 0, 0, 0],
        [0, 1, 0, 0],
      ]);
    });
  });

  describe('buildFeatureMatrix', () => {
    it('should build 15-feature matrix with new signals', () => {
      // All arrays must have the same length (11 items each)
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.0, 153.0, 154.0, 155.0, 156.0, 157.0, 158.0, 159.0, 160.0],
        volume: [100000000, 95000000, 98000000, 97000000, 96000000, 99000000, 100000000, 101000000, 102000000, 103000000, 104000000],
        eventType: ['EARNINGS', 'M&A', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL'],
        aspectScore: [0.5, -0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        mlScore: [0.7, -0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        signalScore: [0.8, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
      };

      const features = buildFeatureMatrix(input);

      // Should have 15 features per row (11 rows, one per day)
      expect(features).toHaveLength(11);
      expect(features[0]).toHaveLength(15);
      expect(features[1]).toHaveLength(15);

      // Check event type one-hot encoding (first row is EARNINGS, second is M&A)
      expect(features[0].slice(4, 10)).toEqual([1, 0, 0, 0, 0, 0]); // EARNINGS
      expect(features[1].slice(4, 10)).toEqual([0, 1, 0, 0, 0, 0]); // M&A

      // Check aspect and ML scores
      expect(features[0][10]).toBe(0.5); // aspect score
      expect(features[0][11]).toBe(0.7); // ML score
      expect(features[0][12]).toBe(0.8); // signal score
      expect(features[1][10]).toBe(-0.3); // aspect score
      expect(features[1][11]).toBe(-0.2); // ML score
      expect(features[1][12]).toBe(0.6); // signal score
    });

    it('should default to GENERAL event type if not provided', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0],
        volume: [100000000],
        // No eventType provided - should default to GENERAL
      };

      const features = buildFeatureMatrix(input);
      expect(features).toHaveLength(1);
      expect(features[0]).toHaveLength(15);
      // Check that event type defaults to GENERAL (index 4-9, with 9=1 for GENERAL)
      expect(features[0].slice(4, 10)).toEqual([0, 0, 0, 0, 0, 1]); // GENERAL
      // Check that aspect and ML default to 0, signal defaults to 0.5
      expect(features[0][10]).toBe(0); // aspect score
      expect(features[0][11]).toBe(0); // ML score
      expect(features[0][12]).toBe(0.5); // signal score default
    });

    it('should default aspect and ML scores to 0 if not provided', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0],
        volume: [100000000],
        eventType: ['EARNINGS'],
        // No aspectScore or mlScore provided - should default to 0
      };

      const features = buildFeatureMatrix(input);
      expect(features).toHaveLength(1);
      expect(features[0]).toHaveLength(15);
      // Check event type is EARNINGS (index 4=1)
      expect(features[0].slice(4, 10)).toEqual([1, 0, 0, 0, 0, 0]); // EARNINGS
      // Check that aspect and ML default to 0, signal defaults to 0.5
      expect(features[0][10]).toBe(0); // aspect score
      expect(features[0][11]).toBe(0); // ML score
      expect(features[0][12]).toBe(0.5); // signal score default
    });

    it('should produce matrix with correct dimensions', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.5, 153.0, 152.5],
        volume: [100000000, 95000000, 98000000, 102000000, 97000000],
        eventType: ['EARNINGS', 'M&A', 'GENERAL', 'GUIDANCE', 'ANALYST_RATING'],
        aspectScore: [0.5, -0.3, 0, 0.2, 0.8],
        mlScore: [0.7, -0.2, 0.1, 0.4, 0.9],
        signalScore: [0.8, 0.6, 0.5, 0.7, 0.9],
      };

      const features = buildFeatureMatrix(input);

      expect(features.length).toBe(5); // 5 rows
      expect(features[0].length).toBe(15); // 15 features (Phase 6 update)
    });

    it('should throw error on inconsistent lengths', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0],
        volume: [100000000], // Wrong length
      };

      expect(() => buildFeatureMatrix(input)).toThrow('Inconsistent input lengths');
    });

    it('should handle empty input', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [],
        volume: [],
      };

      const features = buildFeatureMatrix(input);
      expect(features).toEqual([]);
    });

    it('should match reference data from AAPL sample with defaults', () => {
      const input: PredictionInput = {
        ticker: 'AAPL',
        close: [150.0, 152.0, 151.5, 153.0, 152.5],
        volume: [100000000, 95000000, 98000000, 102000000, 97000000],
        // No eventType/aspectScore/mlScore/signalScore - will default to GENERAL, zeros, and 0.5
      };

      const features = buildFeatureMatrix(input);

      // Verify structure: [price_ratio_1d, price_ratio_5d, price_ratio_10d, volume, ...eventType(6), aspect, ml, signal, sentimentAvailability, volatility]
      // With defaults: eventType=GENERAL [0,0,0,0,0,1], aspect=0, ml=0, signal=0.5, sentimentAvailability=0
      expect(features).toHaveLength(5);
      features.forEach((row) => {
        expect(row).toHaveLength(15);
        // Check event type defaults to GENERAL (indices 4-9)
        expect(row.slice(4, 10)).toEqual([0, 0, 0, 0, 0, 1]);
        // Check aspect and ML default to 0, signal defaults to 0.5
        expect(row[10]).toBe(0); // aspect score
        expect(row[11]).toBe(0); // ML score
        expect(row[12]).toBe(0.5); // signal score default
      });
    });
  });

  describe('createLabels', () => {
    it('should create labels for next day (horizon=1)', () => {
      const close = [150.0, 152.0, 151.0]; // Rise, then drop

      const labels = createLabels(close, 1);

      expect(labels).toEqual([
        0, // 150 < 152 → price rises → label 0
        1, // 152 > 151 → price drops → label 1
      ]);
    });

    it('should create labels for 2-week horizon (horizon=10)', () => {
      const close = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111];

      const labels = createLabels(close, 10);

      // 100 < 110 → 0, 101 < 111 → 0
      expect(labels).toEqual([0, 0]);
    });

    it('should create labels for 1-month horizon (horizon=21)', () => {
      const close = new Array(30).fill(0).map((_, i) => 100 + i);

      const labels = createLabels(close, 21);

      // All rising, so all labels should be 0
      expect(labels.length).toBe(9); // 30 - 21 = 9
      expect(labels.every((label) => label === 0)).toBe(true);
    });

    it('should handle price staying same as rise (label=0)', () => {
      const close = [100, 100, 100];

      const labels = createLabels(close, 1);

      expect(labels).toEqual([
        0, // 100 <= 100 → not dropping → label 0
        0, // 100 <= 100 → not dropping → label 0
      ]);
    });

    it('should handle downward trend', () => {
      const close = [110, 108, 106, 104, 102];

      const labels = createLabels(close, 1);

      expect(labels).toEqual([
        1, // 110 > 108 → drop → 1
        1, // 108 > 106 → drop → 1
        1, // 106 > 104 → drop → 1
        1, // 104 > 102 → drop → 1
      ]);
    });

    it('should return empty array when not enough data', () => {
      const close = [100, 101];

      const labels = createLabels(close, 10);

      expect(labels).toEqual([]); // Need at least 11 points for horizon=10
    });

    it('should return empty array when close.length == horizon', () => {
      const close = [100, 101, 102];

      const labels = createLabels(close, 3);

      expect(labels).toEqual([]);
    });

    it('should throw error for invalid horizon', () => {
      expect(() => createLabels([100, 101], 0)).toThrow('horizon must be >= 1');
      expect(() => createLabels([100, 101], -1)).toThrow('horizon must be >= 1');
    });

    it('should create correct number of labels', () => {
      const close = new Array(50).fill(100);

      const labels1 = createLabels(close, 1);
      expect(labels1.length).toBe(49); // 50 - 1

      const labels10 = createLabels(close, 10);
      expect(labels10.length).toBe(40); // 50 - 10

      const labels21 = createLabels(close, 21);
      expect(labels21.length).toBe(29); // 50 - 21
    });
  });

  describe('validateFeatureMatrix', () => {
    it('should pass for valid feature matrix', () => {
      const X = [
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      ];

      expect(() => validateFeatureMatrix(X)).not.toThrow();
    });

    it('should throw error for empty matrix', () => {
      expect(() => validateFeatureMatrix([])).toThrow('cannot be empty');
    });

    it('should throw error for wrong feature count', () => {
      const X = [[1, 2, 3]]; // Only 3 features

      expect(() => validateFeatureMatrix(X)).toThrow('Expected 15 features');
    });

    it('should throw error for inconsistent feature count', () => {
      const X = [
        [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        [1, 2, 3], // Wrong length
      ];

      expect(() => validateFeatureMatrix(X)).toThrow('Inconsistent feature count');
    });

    it('should throw error for non-finite values', () => {
      const X = [
        [1, 2, 3, NaN, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      ];

      expect(() => validateFeatureMatrix(X)).toThrow('Non-finite value');
    });
  });

  describe('validateLabels', () => {
    it('should pass for valid labels', () => {
      const y = [0, 1, 0, 1, 1, 0];

      expect(() => validateLabels(y)).not.toThrow();
    });

    it('should throw error for empty labels', () => {
      expect(() => validateLabels([])).toThrow('cannot be empty');
    });

    it('should throw error for invalid label values', () => {
      const y = [0, 1, 2]; // 2 is invalid

      expect(() => validateLabels(y)).toThrow('Invalid label');
    });

    it('should throw error for non-binary labels', () => {
      const y = [0, 1, 0.5]; // Must be 0 or 1

      expect(() => validateLabels(y)).toThrow('Invalid label');
    });
  });

  describe('buildPriceOnlyFeatureMatrix', () => {
    it('should build 5-feature matrix from price and volume data', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.0, 153.0, 154.0, 155.0, 156.0, 157.0, 158.0, 159.0, 160.0],
        volume: [100000000, 95000000, 98000000, 97000000, 96000000, 99000000, 100000000, 101000000, 102000000, 103000000, 104000000],
        eventType: ['EARNINGS', 'M&A', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL', 'GENERAL'],
        aspectScore: [0.5, -0.3, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        mlScore: [0.7, -0.2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      };

      const features = buildPriceOnlyFeatureMatrix(input);

      expect(features).toHaveLength(11);
      expect(features[0]).toHaveLength(5); // Only 5 features
    });

    it('should ignore sentiment data entirely', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.0],
        volume: [100000000, 95000000, 98000000],
        mlScore: [0.9, 0.8, 0.7], // Should be ignored
      };

      const features = buildPriceOnlyFeatureMatrix(input);

      // All features should be price-derived only
      expect(features[0]).toHaveLength(5);
      // First row: ratio1d=1.0 (no prior), ratio5d=1.0, ratio10d=1.0, volume, volatility=0
      expect(features[0][0]).toBe(1.0); // ratio1d default
      expect(features[0][3]).toBe(100000000); // volume
      expect(features[0][4]).toBe(0); // volatility (insufficient window)
    });

    it('should calculate correct price ratios', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [100, 110], // 10% rise
        volume: [1000, 1000],
      };

      const features = buildPriceOnlyFeatureMatrix(input);

      expect(features[1][0]).toBeCloseTo(1.1); // ratio1d: 110/100
      expect(features[1][1]).toBe(1.0); // ratio5d: not enough data
      expect(features[1][2]).toBe(1.0); // ratio10d: not enough data
    });

    it('should throw error on inconsistent lengths', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0],
        volume: [100000000],
      };

      expect(() => buildPriceOnlyFeatureMatrix(input)).toThrow('Inconsistent input lengths');
    });

    it('should handle empty input', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [],
        volume: [],
      };

      const features = buildPriceOnlyFeatureMatrix(input);
      expect(features).toEqual([]);
    });

    it('should produce same price features as full matrix', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.5, 153.0, 152.5],
        volume: [100000000, 95000000, 98000000, 102000000, 97000000],
      };

      const fullFeatures = buildFeatureMatrix(input);
      const priceFeatures = buildPriceOnlyFeatureMatrix(input);

      // Price ratios (indices 0-2) and volume (3) should match
      for (let i = 0; i < 5; i++) {
        expect(priceFeatures[i][0]).toBe(fullFeatures[i][0]); // ratio1d
        expect(priceFeatures[i][1]).toBe(fullFeatures[i][1]); // ratio5d
        expect(priceFeatures[i][2]).toBe(fullFeatures[i][2]); // ratio10d
        expect(priceFeatures[i][3]).toBe(fullFeatures[i][3]); // volume
        expect(priceFeatures[i][4]).toBe(fullFeatures[i][14]); // volatility (index 14 in full)
      }
    });
  });

  describe('Constants', () => {
    it('should have correct feature count', () => {
      expect(FEATURE_COUNT).toBe(15); // Phase 6: Updated from 13 to 15
    });

    it('should have correct feature names', () => {
      expect(FEATURE_NAMES).toEqual([
        'price_ratio_1d',
        'price_ratio_5d',
        'price_ratio_10d',
        'volume',
        'event_earnings',
        'event_ma',
        'event_product',
        'event_analyst',
        'event_guidance',
        'event_general',
        'aspect_score',
        'ml_score',
        'signal_score',
        'sentiment_availability',
        'volatility',
      ]);
    });

    it('should have feature names matching feature count', () => {
      expect(FEATURE_NAMES.length).toBe(FEATURE_COUNT);
    });

    it('should have correct price-only feature count', () => {
      expect(PRICE_ONLY_FEATURE_COUNT).toBe(5);
    });

    it('should have correct price-only feature names', () => {
      expect(PRICE_ONLY_FEATURE_NAMES).toEqual([
        'price_ratio_1d',
        'price_ratio_5d',
        'price_ratio_10d',
        'volume',
        'volatility',
      ]);
    });

    it('should have price-only names matching price-only count', () => {
      expect(PRICE_ONLY_FEATURE_NAMES.length).toBe(PRICE_ONLY_FEATURE_COUNT);
    });
  });
});

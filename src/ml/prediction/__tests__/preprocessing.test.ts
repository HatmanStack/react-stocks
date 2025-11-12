/**
 * Feature Engineering and Preprocessing Tests
 */

import {
  oneHotEncode,
  buildFeatureMatrix,
  createLabels,
  validateFeatureMatrix,
  validateLabels,
  FEATURE_COUNT,
  FEATURE_NAMES,
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
    it('should build 8-feature matrix correctly', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0],
        volume: [100000000, 95000000],
        positive: [5, 3],
        negative: [2, 4],
        sentiment: ['POS', 'NEG'],
      };

      const features = buildFeatureMatrix(input);

      expect(features).toEqual([
        [150.0, 100000000, 5, 2, 1, 0, 0, 0], // POS
        [152.0, 95000000, 3, 4, 0, 1, 0, 0], // NEG
      ]);
    });

    it('should handle neutral sentiment', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0],
        volume: [100000000],
        positive: [5],
        negative: [2],
        sentiment: ['NEUT'],
      };

      const features = buildFeatureMatrix(input);
      expect(features).toEqual([[150.0, 100000000, 5, 2, 0, 0, 1, 0]]);
    });

    it('should handle unknown sentiment', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0],
        volume: [100000000],
        positive: [5],
        negative: [2],
        sentiment: ['INVALID'],
      };

      const features = buildFeatureMatrix(input);
      expect(features).toEqual([[150.0, 100000000, 5, 2, 0, 0, 0, 1]]);
    });

    it('should produce matrix with correct dimensions', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0, 151.5, 153.0, 152.5],
        volume: [100000000, 95000000, 98000000, 102000000, 97000000],
        positive: [5, 3, 7, 4, 6],
        negative: [2, 4, 1, 3, 2],
        sentiment: ['POS', 'NEG', 'POS', 'NEUT', 'POS'],
      };

      const features = buildFeatureMatrix(input);

      expect(features.length).toBe(5); // 5 rows
      expect(features[0].length).toBe(8); // 8 features
    });

    it('should throw error on inconsistent lengths', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [150.0, 152.0],
        volume: [100000000], // Wrong length
        positive: [5, 3],
        negative: [2, 4],
        sentiment: ['POS', 'NEG'],
      };

      expect(() => buildFeatureMatrix(input)).toThrow('Inconsistent input lengths');
    });

    it('should handle empty input', () => {
      const input: PredictionInput = {
        ticker: 'TEST',
        close: [],
        volume: [],
        positive: [],
        negative: [],
        sentiment: [],
      };

      const features = buildFeatureMatrix(input);
      expect(features).toEqual([]);
    });

    it('should match reference data from AAPL sample', () => {
      const input: PredictionInput = {
        ticker: 'AAPL',
        close: [150.0, 152.0, 151.5, 153.0, 152.5],
        volume: [100000000, 95000000, 98000000, 102000000, 97000000],
        positive: [5, 3, 7, 4, 6],
        negative: [2, 4, 1, 3, 2],
        sentiment: ['POS', 'NEG', 'POS', 'NEUT', 'POS'],
      };

      const features = buildFeatureMatrix(input);

      // Verify structure matches scaler-reference.json expectations
      expect(features[0]).toEqual([150.0, 100000000, 5, 2, 1, 0, 0, 0]);
      expect(features[1]).toEqual([152.0, 95000000, 3, 4, 0, 1, 0, 0]);
      expect(features[2]).toEqual([151.5, 98000000, 7, 1, 1, 0, 0, 0]);
      expect(features[3]).toEqual([153.0, 102000000, 4, 3, 0, 0, 1, 0]);
      expect(features[4]).toEqual([152.5, 97000000, 6, 2, 1, 0, 0, 0]);
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
        [1, 2, 3, 4, 5, 6, 7, 8],
        [1, 2, 3, 4, 5, 6, 7, 8],
      ];

      expect(() => validateFeatureMatrix(X)).not.toThrow();
    });

    it('should throw error for empty matrix', () => {
      expect(() => validateFeatureMatrix([])).toThrow('cannot be empty');
    });

    it('should throw error for wrong feature count', () => {
      const X = [[1, 2, 3]]; // Only 3 features

      expect(() => validateFeatureMatrix(X)).toThrow('Expected 8 features');
    });

    it('should throw error for inconsistent feature count', () => {
      const X = [
        [1, 2, 3, 4, 5, 6, 7, 8],
        [1, 2, 3], // Wrong length
      ];

      expect(() => validateFeatureMatrix(X)).toThrow('Inconsistent feature count');
    });

    it('should throw error for non-finite values', () => {
      const X = [
        [1, 2, 3, NaN, 5, 6, 7, 8],
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

  describe('Constants', () => {
    it('should have correct feature count', () => {
      expect(FEATURE_COUNT).toBe(8);
    });

    it('should have correct feature names', () => {
      expect(FEATURE_NAMES).toEqual([
        'close',
        'volume',
        'positive',
        'negative',
        'is_pos',
        'is_neg',
        'is_neut',
        'is_unknown',
      ]);
    });

    it('should have feature names matching feature count', () => {
      expect(FEATURE_NAMES.length).toBe(FEATURE_COUNT);
    });
  });
});

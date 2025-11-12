/**
 * StandardScaler Tests
 *
 * Tests against reference data from scaler-reference.json
 * Verifies exact match with scikit-learn behavior
 */

import { StandardScaler, calculateMean, calculateStd } from '../scaler';
import scalerReference from '../../../../docs/ml-migration/test-data/scaler-reference.json';

describe('StandardScaler', () => {
  describe('Basic Functionality', () => {
    it('should fit and transform simple 3-element array', () => {
      const scaler = new StandardScaler();
      const data = [[1.0], [2.0], [3.0]];

      scaler.fit(data);
      const params = scaler.getParams();

      // Verify mean
      expect(params.mean).not.toBeNull();
      expect(params.mean![0]).toBeCloseTo(2.0, 6);

      // Verify std (population: sqrt(2/3) ≈ 0.816496580928)
      expect(params.std).not.toBeNull();
      expect(params.std![0]).toBeCloseTo(0.816496580928, 6);
    });

    it('should transform data to mean=0, std=1', () => {
      const scaler = new StandardScaler();
      const data = [[1.0], [2.0], [3.0]];

      const scaled = scaler.fitTransform(data);

      // Check scaled values match reference
      expect(scaled[0][0]).toBeCloseTo(-1.224744871392, 6);
      expect(scaled[1][0]).toBeCloseTo(0.0, 6);
      expect(scaled[2][0]).toBeCloseTo(1.224744871392, 6);

      // Verify mean ≈ 0
      const mean = calculateMean(scaled);
      expect(mean).toBeCloseTo(0, 6);

      // Verify std ≈ 1
      const std = calculateStd(scaled);
      expect(std).toBeCloseTo(1, 6);
    });

    it('should perform inverse transform correctly', () => {
      const scaler = new StandardScaler();
      const original = [[1.0], [2.0], [3.0]];

      const scaled = scaler.fitTransform(original);
      const recovered = scaler.inverseTransform(scaled);

      // Should recover original values
      expect(recovered[0][0]).toBeCloseTo(1.0, 6);
      expect(recovered[1][0]).toBeCloseTo(2.0, 6);
      expect(recovered[2][0]).toBeCloseTo(3.0, 6);
    });
  });

  describe('Reference Data Validation', () => {
    it('should match simple 3-element example from reference', () => {
      const example = scalerReference.examples[0];
      const scaler = new StandardScaler();
      const data = example.input.map((val) => [val]);

      scaler.fit(data);
      const params = scaler.getParams();

      expect(params.mean![0]).toBeCloseTo(example.calculations.mean.value, 6);
      expect(params.std![0]).toBeCloseTo(example.calculations.std.value, 6);

      const scaled = scaler.transform(data);
      for (let i = 0; i < example.scaled.length; i++) {
        expect(scaled[i][0]).toBeCloseTo(example.scaled[i].value, 6);
      }
    });

    it('should match stock prices example from reference', () => {
      const example = scalerReference.examples[1];
      const scaler = new StandardScaler();
      const data = example.input.map((val) => [val]);

      scaler.fit(data);
      const params = scaler.getParams();

      expect(params.mean![0]).toBeCloseTo(example.calculations.mean.value, 6);
      expect(params.std![0]).toBeCloseTo(example.calculations.std.value, 6);

      const scaled = scaler.transform(data);
      for (let i = 0; i < example.scaled.length; i++) {
        expect(scaled[i][0]).toBeCloseTo(example.scaled[i].value, 6);
      }
    });

    it('should match feature matrix example from reference', () => {
      const example = scalerReference.examples[4]; // AAPL sample
      const scaler = new StandardScaler();
      const data = example.input;

      const scaled = scaler.fitTransform(data);

      // Verify scaled output matches reference
      for (let i = 0; i < example.scaledOutput.length; i++) {
        for (let j = 0; j < example.scaledOutput[i].length; j++) {
          expect(scaled[i][j]).toBeCloseTo(example.scaledOutput[i][j], 6);
        }
      }

      // Verify column-wise calculations
      const params = scaler.getParams();
      for (let j = 0; j < example.columnWiseCalculations.length; j++) {
        const col = example.columnWiseCalculations[j];
        expect(params.mean![j]).toBeCloseTo(col.mean, 6);
        expect(params.std![j]).toBeCloseTo(col.std, 6);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle constant features (std=0)', () => {
      const example = scalerReference.examples[2]; // Constant feature
      const scaler = new StandardScaler();
      const data = example.input.map((val) => [val]);

      scaler.fit(data);
      const params = scaler.getParams();

      expect(params.mean![0]).toBeCloseTo(example.calculations.mean.value, 6);
      expect(params.std![0]).toBe(0.0);

      const scaled = scaler.transform(data);

      // All values should be 0.0 when std=0
      for (let i = 0; i < scaled.length; i++) {
        expect(scaled[i][0]).toBe(0.0);
      }
    });

    it('should handle single data point', () => {
      const scaler = new StandardScaler();
      const data = [[5.0]];

      scaler.fit(data);
      const params = scaler.getParams();

      expect(params.mean![0]).toBe(5.0);
      expect(params.std![0]).toBe(0.0); // Single point has no variance

      const scaled = scaler.transform(data);
      expect(scaled[0][0]).toBe(0.0); // Scaled to 0 when std=0
    });

    it('should throw error on empty data', () => {
      const scaler = new StandardScaler();
      expect(() => scaler.fit([])).toThrow('Cannot fit on empty data');
    });

    it('should throw error on transform before fit', () => {
      const scaler = new StandardScaler();
      expect(() => scaler.transform([[1.0]])).toThrow('Must call fit()');
    });

    it('should throw error on inconsistent feature count', () => {
      const scaler = new StandardScaler();
      const data = [
        [1.0, 2.0],
        [3.0, 4.0, 5.0], // Wrong length
      ];
      expect(() => scaler.fit(data)).toThrow('Inconsistent feature count');
    });

    it('should throw error on non-finite values', () => {
      const scaler = new StandardScaler();
      const data = [[1.0], [NaN], [3.0]];
      expect(() => scaler.fit(data)).toThrow('Non-finite value');
    });

    it('should throw error on feature count mismatch in transform', () => {
      const scaler = new StandardScaler();
      scaler.fit([[1.0, 2.0]]);

      expect(() => scaler.transform([[1.0]])).toThrow('Feature count mismatch');
    });
  });

  describe('Multi-Feature Matrix', () => {
    it('should scale 2x4 matrix correctly', () => {
      const scaler = new StandardScaler();
      const data = [
        [150.0, 100000000.0, 5.0, 2.0],
        [152.0, 95000000.0, 3.0, 4.0],
      ];

      const scaled = scaler.fitTransform(data);

      // Verify each column scaled independently
      for (let j = 0; j < 4; j++) {
        const columnMean = calculateMean(scaled, j);
        const columnStd = calculateStd(scaled, j);

        expect(columnMean).toBeCloseTo(0, 6);
        expect(columnStd).toBeCloseTo(1, 6);
      }
    });

    it('should handle mixed constant and variable features', () => {
      const scaler = new StandardScaler();
      const data = [
        [150.0, 100.0, 5.0], // col0: variable, col1: constant, col2: variable
        [152.0, 100.0, 3.0],
        [151.0, 100.0, 7.0],
      ];

      const scaled = scaler.fitTransform(data);
      const params = scaler.getParams();

      // Column 1 (constant) should have std=0
      expect(params.std![1]).toBe(0.0);

      // Column 1 values should be scaled to 0
      expect(scaled[0][1]).toBe(0.0);
      expect(scaled[1][1]).toBe(0.0);
      expect(scaled[2][1]).toBe(0.0);

      // Other columns should be scaled normally
      expect(calculateMean(scaled, 0)).toBeCloseTo(0, 6);
      expect(calculateStd(scaled, 0)).toBeCloseTo(1, 6);
      expect(calculateMean(scaled, 2)).toBeCloseTo(0, 6);
      expect(calculateStd(scaled, 2)).toBeCloseTo(1, 6);
    });
  });

  describe('Population vs Sample Standard Deviation', () => {
    it('should use population std (÷n), not sample std (÷(n-1))', () => {
      const scaler = new StandardScaler();
      const data = [[1.0], [2.0], [3.0]];

      scaler.fit(data);
      const params = scaler.getParams();

      // Population std: sqrt(2/3) = 0.816496580928
      // Sample std: sqrt(2/2) = 1.0
      // Must use population std
      expect(params.std![0]).toBeCloseTo(0.816496580928, 6);
      expect(params.std![0]).not.toBeCloseTo(1.0, 1);
    });
  });

  describe('Helper Functions', () => {
    it('calculateMean should compute mean correctly', () => {
      const data = [[1.0, 2.0], [3.0, 4.0]];

      const overallMean = calculateMean(data);
      expect(overallMean).toBeCloseTo(2.5, 6);

      const col0Mean = calculateMean(data, 0);
      expect(col0Mean).toBeCloseTo(2.0, 6);

      const col1Mean = calculateMean(data, 1);
      expect(col1Mean).toBeCloseTo(3.0, 6);
    });

    it('calculateStd should compute population std correctly', () => {
      const data = [[1.0], [2.0], [3.0]];

      const std = calculateStd(data, 0);
      expect(std).toBeCloseTo(0.816496580928, 6); // Population std
    });
  });

  describe('isFitted and getParams', () => {
    it('should report fitted status correctly', () => {
      const scaler = new StandardScaler();
      expect(scaler.isFitted()).toBe(false);

      scaler.fit([[1.0], [2.0]]);
      expect(scaler.isFitted()).toBe(true);
    });

    it('should return params correctly', () => {
      const scaler = new StandardScaler();
      const data = [[1.0, 2.0], [3.0, 4.0]];

      scaler.fit(data);
      const params = scaler.getParams();

      expect(params.mean).not.toBeNull();
      expect(params.std).not.toBeNull();
      expect(params.mean!.length).toBe(2);
      expect(params.std!.length).toBe(2);
    });
  });
});

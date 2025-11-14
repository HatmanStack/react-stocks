/**
 * Unit tests for DynamoDB utilities
 */

import { buildUpdateExpression, batchGetItems, batchPutItems, withRetry } from '../../src/utils/dynamodb.util.js';

describe('DynamoDB Utilities', () => {
  describe('buildUpdateExpression', () => {
    it('should build update expression for single field', () => {
      const result = buildUpdateExpression({ status: 'COMPLETED' });

      expect(result.UpdateExpression).toBe('SET #status = :status');
      expect(result.ExpressionAttributeNames).toEqual({ '#status': 'status' });
      expect(result.ExpressionAttributeValues).toEqual({ ':status': 'COMPLETED' });
    });

    it('should build update expression for multiple fields', () => {
      const result = buildUpdateExpression({
        status: 'COMPLETED',
        completedAt: 1234567890,
        articlesProcessed: 50,
      });

      expect(result.UpdateExpression).toBe(
        'SET #status = :status, #completedAt = :completedAt, #articlesProcessed = :articlesProcessed'
      );
      expect(result.ExpressionAttributeNames).toEqual({
        '#status': 'status',
        '#completedAt': 'completedAt',
        '#articlesProcessed': 'articlesProcessed',
      });
      expect(result.ExpressionAttributeValues).toEqual({
        ':status': 'COMPLETED',
        ':completedAt': 1234567890,
        ':articlesProcessed': 50,
      });
    });

    it('should throw error for empty updates object', () => {
      expect(() => buildUpdateExpression({})).toThrow('Updates object cannot be empty');
    });

    it('should handle null and undefined values', () => {
      const result = buildUpdateExpression({ field1: null, field2: undefined });

      expect(result.ExpressionAttributeValues).toEqual({
        ':field1': null,
        ':field2': undefined,
      });
    });
  });

  describe('batchGetItems', () => {
    it('should return empty array for empty keys', async () => {
      const result = await batchGetItems('TestTable', []);
      expect(result).toEqual([]);
    });

    // Note: Full testing requires mocking DynamoDB client responses
    // This would be implemented with proper AWS SDK mocks in integration tests
  });

  describe('batchPutItems', () => {
    it('should handle empty items array', async () => {
      await expect(batchPutItems('TestTable', [])).resolves.not.toThrow();
    });

    // Note: Full testing requires mocking DynamoDB client responses
    // This would be implemented with proper AWS SDK mocks in integration tests
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        return 'success';
      };

      const result = await withRetry(fn, 3);

      expect(result).toBe('success');
      expect(callCount).toBe(1);
    });

    it('should retry on retryable errors', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount === 1) {
          throw { name: 'ProvisionedThroughputExceededException' };
        }
        return 'success';
      };

      const result = await withRetry(fn, 3, 10); // Use small delay for testing

      expect(result).toBe('success');
      expect(callCount).toBe(2);
    });

    it('should throw on non-retryable errors', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        throw { name: 'ValidationException' };
      };

      await expect(withRetry(fn, 3)).rejects.toEqual({ name: 'ValidationException' });
      expect(callCount).toBe(1);
    });

    it('should throw after max retries', async () => {
      let callCount = 0;
      const error = { name: 'ProvisionedThroughputExceededException' };
      const fn = async () => {
        callCount++;
        throw error;
      };

      await expect(withRetry(fn, 2, 10)).rejects.toEqual(error);
      expect(callCount).toBe(3); // Initial + 2 retries
    });

    it('should use exponential backoff', async () => {
      let callCount = 0;
      const fn = async () => {
        callCount++;
        if (callCount <= 2) {
          throw { name: 'ThrottlingException' };
        }
        return 'success';
      };

      const startTime = Date.now();
      await withRetry(fn, 3, 50); // 50ms base delay
      const duration = Date.now() - startTime;

      // Should have delays: 50ms + 100ms = 150ms minimum
      expect(duration).toBeGreaterThanOrEqual(100);
      expect(callCount).toBe(3);
    });
  });
});

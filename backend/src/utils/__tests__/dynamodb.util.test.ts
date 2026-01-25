/**
 * Tests for DynamoDB Utility Functions
 *
 * Tests pure functions that don't require mocking DynamoDB client.
 */

import { describe, it, expect } from '@jest/globals';
import { buildUpdateExpression } from '../dynamodb.util.js';

describe('DynamoDB Utility Functions', () => {
  describe('buildUpdateExpression', () => {
    it('should build expression for single field', () => {
      const result = buildUpdateExpression({ status: 'COMPLETED' });

      expect(result.UpdateExpression).toBe('SET #status = :status');
      expect(result.ExpressionAttributeNames).toEqual({ '#status': 'status' });
      expect(result.ExpressionAttributeValues).toEqual({ ':status': 'COMPLETED' });
    });

    it('should build expression for multiple fields', () => {
      const result = buildUpdateExpression({
        status: 'COMPLETED',
        completedAt: 1234567890,
        articlesProcessed: 42,
      });

      expect(result.UpdateExpression).toContain('SET');
      expect(result.UpdateExpression).toContain('#status = :status');
      expect(result.UpdateExpression).toContain('#completedAt = :completedAt');
      expect(result.UpdateExpression).toContain('#articlesProcessed = :articlesProcessed');

      expect(result.ExpressionAttributeNames).toEqual({
        '#status': 'status',
        '#completedAt': 'completedAt',
        '#articlesProcessed': 'articlesProcessed',
      });

      expect(result.ExpressionAttributeValues).toEqual({
        ':status': 'COMPLETED',
        ':completedAt': 1234567890,
        ':articlesProcessed': 42,
      });
    });

    it('should throw error for empty updates', () => {
      expect(() => buildUpdateExpression({})).toThrow('Updates object cannot be empty');
    });

    it('should handle boolean values', () => {
      const result = buildUpdateExpression({ isComplete: true, isFailed: false });

      expect(result.ExpressionAttributeValues).toEqual({
        ':isComplete': true,
        ':isFailed': false,
      });
    });

    it('should handle null values', () => {
      const result = buildUpdateExpression({ error: null });

      expect(result.ExpressionAttributeValues).toEqual({
        ':error': null,
      });
    });

    it('should handle object values', () => {
      const metadata = { source: 'api', version: 1 };
      const result = buildUpdateExpression({ metadata });

      expect(result.ExpressionAttributeValues).toEqual({
        ':metadata': metadata,
      });
    });

    it('should handle array values', () => {
      const tags = ['urgent', 'automated'];
      const result = buildUpdateExpression({ tags });

      expect(result.ExpressionAttributeValues).toEqual({
        ':tags': tags,
      });
    });
  });
});

/**
 * Tests for Circuit Breaker Repository - Key Construction
 *
 * Tests the key construction helpers used by the circuit breaker repository.
 * Full integration tests require DynamoDB Local or LocalStack.
 */

import { describe, it, expect } from '@jest/globals';
import {
  makeCircuitPK,
  makeStateSK,
} from '../../types/dynamodb.types.js';

describe('Circuit Breaker Key Construction', () => {
  describe('makeCircuitPK', () => {
    it('should create correct partition key', () => {
      const pk = makeCircuitPK('mlsentiment');
      expect(pk).toBe('CIRCUIT#mlsentiment');
    });

    it('should handle different service names', () => {
      const pk = makeCircuitPK('external-api');
      expect(pk).toBe('CIRCUIT#external-api');
    });
  });

  describe('makeStateSK', () => {
    it('should return STATE sort key', () => {
      const sk = makeStateSK();
      expect(sk).toBe('STATE');
    });
  });

  describe('Circuit Breaker Item Structure', () => {
    it('should have correct key format for DynamoDB', () => {
      const pk = makeCircuitPK('mlsentiment');
      const sk = makeStateSK();

      // Verify keys are strings and have expected format
      expect(typeof pk).toBe('string');
      expect(typeof sk).toBe('string');
      expect(pk).toMatch(/^CIRCUIT#/);
    });
  });
});

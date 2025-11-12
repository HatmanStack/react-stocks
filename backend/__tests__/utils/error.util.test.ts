/**
 * Tests for error utilities
 */

import {
  APIError,
  logError,
  getStatusCodeFromError,
  getErrorMessage,
} from '../../src/utils/error.util';

describe('Error Utilities', () => {
  describe('APIError', () => {
    it('should create an APIError with default status 500', () => {
      const error = new APIError('Something went wrong');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(APIError);
      expect(error.message).toBe('Something went wrong');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('APIError');
    });

    it('should create an APIError with custom status code', () => {
      const error = new APIError('Not found', 404);

      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Not found');
    });

    it('should have a stack trace', () => {
      const error = new APIError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('APIError');
    });
  });

  describe('logError', () => {
    let consoleErrorSpy: typeof console.error;

    beforeEach(() => {
      consoleErrorSpy = console.error;
      console.error = () => {}; // Mock implementation
    });

    afterEach(() => {
      console.error = consoleErrorSpy; // Restore
    });

    it('should log error with context', () => {
      const error = new Error('Test error');

      // Just verify it doesn't throw
      expect(() => logError('TestHandler', error)).not.toThrow();
    });

    it('should log error with additional info', () => {
      const error = new Error('Test error');
      const additionalInfo = { requestId: '123', ticker: 'AAPL' };

      // Just verify it doesn't throw
      expect(() => logError('TestHandler', error, additionalInfo)).not.toThrow();
    });

    it('should handle non-Error objects', () => {
      // Just verify it doesn't throw
      expect(() => logError('TestHandler', 'String error')).not.toThrow();
    });
  });

  describe('getStatusCodeFromError', () => {
    it('should extract status code from APIError', () => {
      const error = new APIError('Not found', 404);
      expect(getStatusCodeFromError(error)).toBe(404);
    });

    it('should return 500 for standard Error', () => {
      const error = new Error('Standard error');
      expect(getStatusCodeFromError(error)).toBe(500);
    });

    it('should return 500 for non-Error objects', () => {
      expect(getStatusCodeFromError('String error')).toBe(500);
      expect(getStatusCodeFromError({ message: 'Object error' })).toBe(500);
      expect(getStatusCodeFromError(null)).toBe(500);
    });
  });

  describe('getErrorMessage', () => {
    it('should extract message from Error', () => {
      const error = new Error('Test error');
      expect(getErrorMessage(error)).toBe('Test error');
    });

    it('should extract message from APIError', () => {
      const error = new APIError('API error', 400);
      expect(getErrorMessage(error)).toBe('API error');
    });

    it('should convert non-Error to string', () => {
      expect(getErrorMessage('String error')).toBe('String error');
      expect(getErrorMessage(123)).toBe('123');
      expect(getErrorMessage(null)).toBe('null');
      expect(getErrorMessage(undefined)).toBe('undefined');
    });

    it('should handle object errors', () => {
      const obj = { message: 'Object error' };
      expect(getErrorMessage(obj)).toBe('[object Object]');
    });
  });
});

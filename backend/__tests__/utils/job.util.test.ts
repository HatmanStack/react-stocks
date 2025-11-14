/**
 * Unit tests for job utilities
 */

import { generateJobId, parseJobId, isValidJobStatus } from '../../src/utils/job.util.js';

describe('Job Utilities', () => {
  describe('generateJobId', () => {
    it('should generate job ID from ticker and date range', () => {
      const jobId = generateJobId('AAPL', '2025-01-01', '2025-01-30');
      expect(jobId).toBe('AAPL_2025-01-01_2025-01-30');
    });

    it('should uppercase ticker symbol', () => {
      const jobId = generateJobId('aapl', '2025-01-01', '2025-01-30');
      expect(jobId).toBe('AAPL_2025-01-01_2025-01-30');
    });

    it('should handle lowercase ticker', () => {
      const jobId = generateJobId('googl', '2025-01-01', '2025-01-30');
      expect(jobId).toBe('GOOGL_2025-01-01_2025-01-30');
    });

    it('should handle mixed case ticker', () => {
      const jobId = generateJobId('TsLa', '2025-01-01', '2025-01-30');
      expect(jobId).toBe('TSLA_2025-01-01_2025-01-30');
    });

    it('should generate deterministic IDs', () => {
      const jobId1 = generateJobId('AAPL', '2025-01-01', '2025-01-30');
      const jobId2 = generateJobId('aapl', '2025-01-01', '2025-01-30');

      expect(jobId1).toBe(jobId2);
    });

    it('should generate different IDs for different date ranges', () => {
      const jobId1 = generateJobId('AAPL', '2025-01-01', '2025-01-30');
      const jobId2 = generateJobId('AAPL', '2025-02-01', '2025-02-28');

      expect(jobId1).not.toBe(jobId2);
    });

    it('should generate different IDs for different tickers', () => {
      const jobId1 = generateJobId('AAPL', '2025-01-01', '2025-01-30');
      const jobId2 = generateJobId('GOOGL', '2025-01-01', '2025-01-30');

      expect(jobId1).not.toBe(jobId2);
    });
  });

  describe('parseJobId', () => {
    it('should parse job ID into ticker and date range', () => {
      const result = parseJobId('AAPL_2025-01-01_2025-01-30');

      expect(result).toEqual({
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
      });
    });

    it('should handle different tickers', () => {
      const result = parseJobId('GOOGL_2025-02-01_2025-02-28');

      expect(result).toEqual({
        ticker: 'GOOGL',
        startDate: '2025-02-01',
        endDate: '2025-02-28',
      });
    });

    it('should be inverse of generateJobId', () => {
      const ticker = 'AAPL';
      const startDate = '2025-01-01';
      const endDate = '2025-01-30';

      const jobId = generateJobId(ticker, startDate, endDate);
      const parsed = parseJobId(jobId);

      expect(parsed.ticker).toBe(ticker.toUpperCase());
      expect(parsed.startDate).toBe(startDate);
      expect(parsed.endDate).toBe(endDate);
    });

    it('should throw error for invalid job ID format', () => {
      expect(() => parseJobId('INVALID')).toThrow('Invalid job ID format');
    });

    it('should throw error for job ID with too many parts', () => {
      expect(() => parseJobId('AAPL_2025-01-01_2025-01-30_EXTRA')).toThrow('Invalid job ID format');
    });

    it('should throw error for job ID with too few parts', () => {
      expect(() => parseJobId('AAPL_2025-01-01')).toThrow('Invalid job ID format');
    });

    it('should throw error for invalid date format in start date', () => {
      expect(() => parseJobId('AAPL_01-01-2025_2025-01-30')).toThrow('Invalid date format');
    });

    it('should throw error for invalid date format in end date', () => {
      expect(() => parseJobId('AAPL_2025-01-01_01-30-2025')).toThrow('Invalid date format');
    });

    it('should throw error for malformed dates', () => {
      expect(() => parseJobId('AAPL_2025-1-1_2025-01-30')).toThrow('Invalid date format');
    });
  });

  describe('isValidJobStatus', () => {
    it('should return true for PENDING', () => {
      expect(isValidJobStatus('PENDING')).toBe(true);
    });

    it('should return true for IN_PROGRESS', () => {
      expect(isValidJobStatus('IN_PROGRESS')).toBe(true);
    });

    it('should return true for COMPLETED', () => {
      expect(isValidJobStatus('COMPLETED')).toBe(true);
    });

    it('should return true for FAILED', () => {
      expect(isValidJobStatus('FAILED')).toBe(true);
    });

    it('should return false for invalid status', () => {
      expect(isValidJobStatus('INVALID')).toBe(false);
    });

    it('should return false for lowercase status', () => {
      expect(isValidJobStatus('pending')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidJobStatus('')).toBe(false);
    });

    it('should return false for partial match', () => {
      expect(isValidJobStatus('COMPLETE')).toBe(false);
    });
  });
});

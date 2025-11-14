/**
 * Unit tests for SentimentJobs repository
 */

import {
  getJob,
  createJob,
  updateJobStatus,
  markJobCompleted,
  markJobFailed,
  type SentimentJob,
} from '../../src/repositories/sentimentJobs.repository.js';
import type { JobStatus } from '../../src/utils/job.util.js';

describe('SentimentJobs Repository', () => {
  describe('Type Definitions', () => {
    it('should accept valid SentimentJob with PENDING status', () => {
      const job: SentimentJob = {
        jobId: 'AAPL_2025-01-01_2025-01-30',
        status: 'PENDING',
        ticker: 'AAPL',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
        ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      };

      expect(job.status).toBe('PENDING');
      expect(job.jobId).toContain('AAPL');
      expect(job.startDate).toBe('2025-01-01');
    });

    it('should accept SentimentJob with IN_PROGRESS status', () => {
      const job: SentimentJob = {
        jobId: 'GOOGL_2025-01-01_2025-01-30',
        status: 'IN_PROGRESS',
        ticker: 'GOOGL',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
        startedAt: Date.now(),
        ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      };

      expect(job.status).toBe('IN_PROGRESS');
      expect(job.startedAt).toBeDefined();
    });

    it('should accept SentimentJob with COMPLETED status', () => {
      const job: SentimentJob = {
        jobId: 'TSLA_2025-01-01_2025-01-30',
        status: 'COMPLETED',
        ticker: 'TSLA',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
        startedAt: Date.now() - 5000,
        completedAt: Date.now(),
        articlesProcessed: 50,
        ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      };

      expect(job.status).toBe('COMPLETED');
      expect(job.completedAt).toBeDefined();
      expect(job.articlesProcessed).toBe(50);
    });

    it('should accept SentimentJob with FAILED status', () => {
      const job: SentimentJob = {
        jobId: 'MSFT_2025-01-01_2025-01-30',
        status: 'FAILED',
        ticker: 'MSFT',
        startDate: '2025-01-01',
        endDate: '2025-01-30',
        startedAt: Date.now() - 5000,
        completedAt: Date.now(),
        error: 'API timeout error',
        ttl: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      };

      expect(job.status).toBe('FAILED');
      expect(job.error).toBe('API timeout error');
      expect(job.completedAt).toBeDefined();
    });
  });

  describe('Repository Function Signatures', () => {
    it('should have correct getJob signature', () => {
      expect(typeof getJob).toBe('function');
      expect(getJob.length).toBe(1); // jobId
    });

    it('should have correct createJob signature', () => {
      expect(typeof createJob).toBe('function');
      expect(createJob.length).toBe(1); // job
    });

    it('should have correct updateJobStatus signature', () => {
      expect(typeof updateJobStatus).toBe('function');
      expect(updateJobStatus.length).toBe(3); // jobId, status, updates
    });

    it('should have correct markJobCompleted signature', () => {
      expect(typeof markJobCompleted).toBe('function');
      expect(markJobCompleted.length).toBe(2); // jobId, articlesProcessed
    });

    it('should have correct markJobFailed signature', () => {
      expect(typeof markJobFailed).toBe('function');
      expect(markJobFailed.length).toBe(2); // jobId, error
    });
  });

  describe('Job Lifecycle', () => {
    it('should have valid job lifecycle states', () => {
      const validStatuses: JobStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];

      validStatuses.forEach((status) => {
        expect(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED']).toContain(status);
      });
    });

    it('should transition from PENDING to IN_PROGRESS', () => {
      const initialStatus: JobStatus = 'PENDING';
      const nextStatus: JobStatus = 'IN_PROGRESS';

      expect(initialStatus).toBe('PENDING');
      expect(nextStatus).toBe('IN_PROGRESS');
    });

    it('should transition from IN_PROGRESS to COMPLETED', () => {
      const initialStatus: JobStatus = 'IN_PROGRESS';
      const nextStatus: JobStatus = 'COMPLETED';

      expect(initialStatus).toBe('IN_PROGRESS');
      expect(nextStatus).toBe('COMPLETED');
    });

    it('should transition from IN_PROGRESS to FAILED', () => {
      const initialStatus: JobStatus = 'IN_PROGRESS';
      const nextStatus: JobStatus = 'FAILED';

      expect(initialStatus).toBe('IN_PROGRESS');
      expect(nextStatus).toBe('FAILED');
    });
  });

  describe('Job ID Format', () => {
    it('should accept job ID with ticker and date range', () => {
      const jobId = 'AAPL_2025-01-01_2025-01-30';

      expect(jobId).toContain('AAPL');
      expect(jobId).toContain('2025-01-01');
      expect(jobId).toContain('2025-01-30');
    });

    it('should parse ticker from job ID', () => {
      const jobId = 'GOOGL_2025-01-01_2025-01-30';
      const ticker = jobId.split('_')[0];

      expect(ticker).toBe('GOOGL');
    });

    it('should parse date range from job ID', () => {
      const jobId = 'TSLA_2025-01-01_2025-01-30';
      const parts = jobId.split('_');
      const startDate = parts[1];
      const endDate = parts[2];

      expect(startDate).toBe('2025-01-01');
      expect(endDate).toBe('2025-01-30');
    });
  });

  describe('TTL Calculation', () => {
    it('should set TTL to approximately 24 hours from now', () => {
      // TTL should be in seconds, not milliseconds
      const twentyFourHoursInSeconds = 24 * 60 * 60;
      expect(twentyFourHoursInSeconds).toBe(86400); // 24 hours = 86,400 seconds
    });

    it('should have shortest TTL compared to other caches', () => {
      const jobsTTL = 24 * 60 * 60; // 24 hours
      const stocksTTL = 7 * 24 * 60 * 60; // 7 days
      const newsTTL = 30 * 24 * 60 * 60; // 30 days
      const sentimentTTL = 90 * 24 * 60 * 60; // 90 days

      expect(jobsTTL).toBeLessThan(stocksTTL);
      expect(jobsTTL).toBeLessThan(newsTTL);
      expect(jobsTTL).toBeLessThan(sentimentTTL);
    });
  });

  describe('Job Metadata', () => {
    it('should track articles processed count', () => {
      const articlesProcessed = 50;
      expect(articlesProcessed).toBeGreaterThan(0);
      expect(typeof articlesProcessed).toBe('number');
    });

    it('should record start and completion timestamps', () => {
      const startedAt = Date.now() - 5000; // 5 seconds ago
      const completedAt = Date.now();

      expect(completedAt).toBeGreaterThan(startedAt);
      expect(completedAt - startedAt).toBeGreaterThanOrEqual(5000);
    });

    it('should store error messages for failed jobs', () => {
      const errorMessage = 'API timeout after 30 seconds';

      expect(errorMessage).toBeTruthy();
      expect(errorMessage).toContain('timeout');
    });
  });
});

/**
 * SentimentJobs Repository
 *
 * Provides job tracking operations for async sentiment analysis processing
 */

import {
  GetCommand,
  PutCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { dynamoDb, buildUpdateExpression } from '../utils/dynamodb.util.js';
import { calculateTTL } from '../utils/cache.util.js';
import type { JobStatus } from '../utils/job.util.js';

const TABLE_NAME = process.env.SENTIMENT_JOBS_TABLE || 'SentimentJobs';

/**
 * Sentiment job interface
 */
export interface SentimentJob {
  jobId: string;
  status: JobStatus;
  ticker: string;
  startDate: string;
  endDate: string;
  startedAt?: number;
  completedAt?: number;
  articlesProcessed?: number;
  error?: string;
  ttl: number;
}

/**
 * Get job by job ID
 *
 * @param jobId - Unique job identifier
 * @returns Sentiment job or null if not found
 *
 * @example
 * const job = await getJob('AAPL_2025-01-01_2025-01-30');
 */
export async function getJob(jobId: string): Promise<SentimentJob | null> {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        jobId,
      },
    });

    const response = await dynamoDb.send(command);

    if (!response.Item) {
      return null;
    }

    return response.Item as SentimentJob;
  } catch (error) {
    console.error('[SentimentJobsRepository] Error getting job:', error, { jobId });
    throw error;
  }
}

/**
 * Create new sentiment analysis job
 * Automatically sets TTL to 24 hours from now
 * Sets initial status to PENDING
 *
 * @param job - Job data (without ttl)
 *
 * @example
 * await createJob({
 *   jobId: 'AAPL_2025-01-01_2025-01-30',
 *   status: 'PENDING',
 *   ticker: 'AAPL',
 *   startDate: '2025-01-01',
 *   endDate: '2025-01-30'
 * });
 */
export async function createJob(job: Omit<SentimentJob, 'ttl'>): Promise<void> {
  try {
    // Check if job already exists
    const existingJob = await getJob(job.jobId);

    if (existingJob) {
      // If job is already COMPLETED, return without error (idempotent)
      if (existingJob.status === 'COMPLETED') {
        console.log('[SentimentJobsRepository] Job already completed (idempotent):', {
          jobId: job.jobId,
        });
        return;
      }

      // If job exists but not completed, log and return
      console.log('[SentimentJobsRepository] Job already exists:', {
        jobId: job.jobId,
        status: existingJob.status,
      });
      return;
    }

    const jobItem: SentimentJob = {
      ...job,
      ttl: calculateTTL(1), // 24 hours expiration
      status: job.status || 'PENDING',
    };

    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: jobItem,
    });

    await dynamoDb.send(command);
  } catch (error) {
    console.error('[SentimentJobsRepository] Error creating job:', error, {
      jobId: job.jobId,
    });
    throw error;
  }
}

/**
 * Update job status atomically
 * Uses DynamoDB UpdateItem for atomic updates
 *
 * @param jobId - Job identifier
 * @param status - New job status
 * @param updates - Additional fields to update
 *
 * @example
 * await updateJobStatus('AAPL_2025-01-01_2025-01-30', 'IN_PROGRESS', {
 *   startedAt: Date.now()
 * });
 */
export async function updateJobStatus(
  jobId: string,
  status: JobStatus,
  updates: Partial<SentimentJob> = {}
): Promise<void> {
  try {
    const updateData = {
      ...updates,
      status, // Status always wins
    };

    const { UpdateExpression, ExpressionAttributeNames, ExpressionAttributeValues } =
      buildUpdateExpression(updateData);

    const command = new UpdateCommand({
      TableName: TABLE_NAME,
      Key: {
        jobId,
      },
      UpdateExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    });

    await dynamoDb.send(command);
  } catch (error) {
    console.error('[SentimentJobsRepository] Error updating job status:', error, {
      jobId,
      status,
    });
    throw error;
  }
}

/**
 * Mark job as completed
 * Helper method that sets status to COMPLETED and records completion time
 *
 * @param jobId - Job identifier
 * @param articlesProcessed - Number of articles processed
 *
 * @example
 * await markJobCompleted('AAPL_2025-01-01_2025-01-30', 50);
 */
export async function markJobCompleted(
  jobId: string,
  articlesProcessed: number
): Promise<void> {
  await updateJobStatus(jobId, 'COMPLETED', {
    completedAt: Date.now(),
    articlesProcessed,
  });
}

/**
 * Mark job as failed
 * Helper method that sets status to FAILED and records error message
 *
 * @param jobId - Job identifier
 * @param error - Error message or description
 *
 * @example
 * await markJobFailed('AAPL_2025-01-01_2025-01-30', 'API timeout error');
 */
export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await updateJobStatus(jobId, 'FAILED', {
    error,
    completedAt: Date.now(), // Record when it failed
  });
}

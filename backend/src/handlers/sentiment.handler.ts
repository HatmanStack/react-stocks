/**
 * Sentiment Handler
 *
 * Provides endpoints for async sentiment analysis:
 * - POST /sentiment - Trigger sentiment analysis
 * - GET /sentiment/job/:jobId - Get job status
 * - GET /sentiment - Get cached sentiment results
 */

import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { processSentimentForTicker } from '../services/sentimentProcessing.service.js';
import * as SentimentJobsRepository from '../repositories/sentimentJobs.repository.js';
import * as SentimentCacheRepository from '../repositories/sentimentCache.repository.js';
import * as NewsCacheRepository from '../repositories/newsCache.repository.js';
import { generateJobId } from '../utils/job.util.js';
import { successResponse, errorResponse } from '../utils/response.util.js';

/**
 * POST /sentiment - Trigger sentiment analysis for a ticker
 *
 * Request body: { ticker: string, startDate: string, endDate: string }
 * Response: { jobId: string, status: string, cached: boolean }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleSentimentRequest(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Parse and validate request body
    if (!event.body) {
      return errorResponse(400, 'Request body is required');
    }

    let body: { ticker?: string; startDate?: string; endDate?: string };
    try {
      body = JSON.parse(event.body);
    } catch {
      return errorResponse(400, 'Invalid JSON in request body');
    }

    const { ticker, startDate, endDate } = body;

    // Validate required fields
    if (!ticker || !startDate || !endDate) {
      return errorResponse(400, 'Missing required fields: ticker, startDate, endDate');
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return errorResponse(400, 'Invalid date format. Use YYYY-MM-DD');
    }

    // Generate deterministic job ID
    const jobId = generateJobId(ticker, startDate, endDate);

    // Check for existing job
    const existingJob = await SentimentJobsRepository.getJob(jobId);

    if (existingJob) {
      // Return existing job status
      return successResponse({
        jobId,
        status: existingJob.status,
        ticker: existingJob.ticker,
        startDate: existingJob.startDate,
        endDate: existingJob.endDate,
        cached: true,
        articlesProcessed: existingJob.articlesProcessed,
        completedAt: existingJob.completedAt,
      });
    }

    // Create new job
    await SentimentJobsRepository.createJob({
      jobId,
      status: 'IN_PROGRESS',
      ticker: ticker.toUpperCase(),
      startDate,
      endDate,
      startedAt: Date.now(),
    });

    // Process sentiment synchronously (MVP approach)
    try {
      const result = await processSentimentForTicker(ticker, startDate, endDate);

      // Mark job as completed
      await SentimentJobsRepository.markJobCompleted(jobId, result.articlesProcessed);

      return successResponse({
        jobId,
        status: 'COMPLETED',
        ticker: ticker.toUpperCase(),
        startDate,
        endDate,
        cached: false,
        articlesProcessed: result.articlesProcessed,
        articlesSkipped: result.articlesSkipped,
        processingTimeMs: result.processingTimeMs,
        completedAt: Date.now(),
      });
    } catch (processingError) {
      // Mark job as failed
      const errorMessage =
        processingError instanceof Error
          ? processingError.message
          : 'Unknown error during sentiment processing';
      await SentimentJobsRepository.markJobFailed(jobId, errorMessage);

      throw processingError; // Re-throw to be caught by outer catch
    }
  } catch (error) {
    console.error('[SentimentHandler] Error processing sentiment request:', error, {
      requestId: event.requestContext.requestId,
    });

    return errorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
}

/**
 * GET /sentiment/job/:jobId - Get sentiment job status
 *
 * Path parameter: jobId
 * Response: { jobId, status, ticker, startDate, endDate, ... }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleSentimentJobStatusRequest(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Extract job ID from path parameters
    const jobId = event.pathParameters?.jobId;

    if (!jobId) {
      return errorResponse(400, 'Job ID is required');
    }

    // Fetch job from database
    const job = await SentimentJobsRepository.getJob(jobId);

    if (!job) {
      return errorResponse(404, `Job not found: ${jobId}`);
    }

    // Return job status with all metadata
    return successResponse({
      jobId: job.jobId,
      status: job.status,
      ticker: job.ticker,
      startDate: job.startDate,
      endDate: job.endDate,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      articlesProcessed: job.articlesProcessed,
      durationMs: job.startedAt && job.completedAt ? job.completedAt - job.startedAt : undefined,
      error: job.error,
    });
  } catch (error) {
    console.error('[SentimentHandler] Error getting job status:', error, {
      requestId: event.requestContext.requestId,
    });

    return errorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
}

/**
 * GET /sentiment - Get cached sentiment results
 *
 * Query parameters: ticker (required), startDate, endDate
 * Response: { ticker, startDate, endDate, dailySentiment: [...], cached: true }
 *
 * @param event - API Gateway event
 * @returns API Gateway response
 */
export async function handleSentimentResultsRequest(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> {
  try {
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const ticker = params.ticker;
    const startDate = params.startDate;
    const endDate = params.endDate;

    // Validate ticker
    if (!ticker) {
      return errorResponse(400, 'Query parameter "ticker" is required');
    }

    // Fetch all sentiments for ticker
    const allSentiments = await SentimentCacheRepository.querySentimentsByTicker(ticker);

    if (allSentiments.length === 0) {
      return successResponse({
        ticker: ticker.toUpperCase(),
        startDate: startDate || null,
        endDate: endDate || null,
        dailySentiment: [],
        cached: false,
      });
    }

    // Fetch all news articles to get dates
    const allArticles = await NewsCacheRepository.queryArticlesByTicker(ticker);

    // Create map of articleHash -> article date
    const articleDateMap = new Map<string, string>();
    for (const article of allArticles) {
      articleDateMap.set(article.articleHash, article.article.date);
    }

    // Filter sentiments by date range if provided
    const filteredSentiments = allSentiments.filter((sentiment) => {
      const articleDate = articleDateMap.get(sentiment.articleHash);
      if (!articleDate) return false;

      if (startDate && articleDate < startDate) return false;
      if (endDate && articleDate > endDate) return false;

      return true;
    });

    // Group sentiments by date
    const dailyGroups = new Map<string, SentimentCacheRepository.SentimentCacheItem[]>();

    for (const sentiment of filteredSentiments) {
      const date = articleDateMap.get(sentiment.articleHash);
      if (!date) continue;

      if (!dailyGroups.has(date)) {
        dailyGroups.set(date, []);
      }
      dailyGroups.get(date)!.push(sentiment);
    }

    // Aggregate daily sentiment
    const dailySentiment = Array.from(dailyGroups.entries())
      .map(([date, sentiments]) => {
        const totalPositive = sentiments.reduce((sum, s) => sum + s.sentiment.positive, 0);
        const totalNegative = sentiments.reduce((sum, s) => sum + s.sentiment.negative, 0);
        const totalSentences = totalPositive + totalNegative;

        const sentimentScore = totalSentences > 0 ? (totalPositive - totalNegative) / totalSentences : 0;

        let classification: 'POS' | 'NEG' | 'NEUT';
        if (sentimentScore > 0.1) {
          classification = 'POS';
        } else if (sentimentScore < -0.1) {
          classification = 'NEG';
        } else {
          classification = 'NEUT';
        }

        return {
          date,
          positive: totalPositive,
          negative: totalNegative,
          sentimentScore,
          classification,
          articleCount: sentiments.length,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    return successResponse({
      ticker: ticker.toUpperCase(),
      startDate: startDate || null,
      endDate: endDate || null,
      dailySentiment,
      cached: true,
    });
  } catch (error) {
    console.error('[SentimentHandler] Error getting sentiment results:', error, {
      requestId: event.requestContext.requestId,
    });

    return errorResponse(
      500,
      error instanceof Error ? error.message : 'Internal server error'
    );
  }
}

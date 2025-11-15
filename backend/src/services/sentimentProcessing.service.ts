/**
 * Sentiment Processing Service
 *
 * Orchestrates sentiment analysis workflow:
 * 1. Fetch news articles from cache
 * 2. Check which articles already have sentiment (deduplication)
 * 3. Analyze new articles in parallel
 * 4. Cache results in DynamoDB
 * 5. Aggregate daily sentiment scores
 */

import * as NewsCacheRepository from '../repositories/newsCache.repository.js';
import * as SentimentCacheRepository from '../repositories/sentimentCache.repository.js';
import { analyzeSentimentBatch, analyzeSentiment } from '../ml/sentiment/analyzer.js';
import { aggregateDailySentiment, type DailySentiment } from '../utils/sentiment.util.js';
import type {
  NewsCacheItem,
  SentimentCacheItem,
  SentimentData,
} from '../repositories/index.js';

/**
 * Result of sentiment processing operation
 */
export interface SentimentProcessingResult {
  ticker: string;
  articlesProcessed: number; // New articles analyzed
  articlesSkipped: number; // Articles with cached sentiment (deduplicated)
  articlesNotFound: number; // Articles in cache but outside requested date range
  dailySentiment: DailySentiment[];
  processingTimeMs: number;
}

/**
 * Progress callback for monitoring processing steps
 */
export type ProgressCallback = (progress: {
  step: string;
  current: number;
  total: number;
}) => void;

/**
 * Process sentiment analysis for a ticker within a date range
 *
 * Workflow:
 * 1. Fetch news articles from cache
 * 2. Filter by date range
 * 3. Check which articles need analysis (skip if sentiment cached)
 * 4. Batch analyze new articles
 * 5. Cache sentiment results
 * 6. Aggregate daily sentiment
 *
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @param onProgress - Optional progress callback
 * @returns Processing result with daily sentiment
 *
 * @example
 * const result = await processSentimentForTicker('AAPL', '2025-01-01', '2025-01-30');
 */
export async function processSentimentForTicker(
  ticker: string,
  startDate: string,
  endDate: string,
  onProgress?: ProgressCallback
): Promise<SentimentProcessingResult> {
  const startTime = Date.now();

  try {
    // Step 1: Fetch news articles from cache
    onProgress?.({ step: 'Fetching news articles', current: 0, total: 100 });

    const allArticles = await NewsCacheRepository.queryArticlesByTicker(ticker);

    if (allArticles.length === 0) {
      return {
        ticker,
        articlesProcessed: 0,
        articlesSkipped: 0,
        articlesNotFound: 0,
        dailySentiment: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    // Step 2: Filter by date range
    const articlesInRange = filterArticlesByDateRange(allArticles, startDate, endDate);

    if (articlesInRange.length === 0) {
      return {
        ticker,
        articlesProcessed: 0,
        articlesSkipped: 0,
        articlesNotFound: allArticles.length,
        dailySentiment: [],
        processingTimeMs: Date.now() - startTime,
      };
    }

    onProgress?.({
      step: 'Checking existing sentiment',
      current: 20,
      total: 100
    });

    // Step 3: Check which articles need analysis
    const { articlesToAnalyze, articlesCached } = await partitionArticlesByCache(
      ticker,
      articlesInRange
    );

    onProgress?.({
      step: 'Analyzing sentiment',
      current: 40,
      total: 100,
    });

    // Step 4: Analyze new articles
    const newSentiments = await analyzeArticles(ticker, articlesToAnalyze);

    onProgress?.({
      step: 'Caching results',
      current: 80,
      total: 100,
    });

    // Step 5: Cache new sentiment results
    if (newSentiments.length > 0) {
      await SentimentCacheRepository.batchPutSentiments(newSentiments);
    }

    onProgress?.({
      step: 'Aggregating daily sentiment',
      current: 90,
      total: 100,
    });

    // Step 6: Fetch all sentiments (cached + new) and aggregate by date
    const allSentiments = await SentimentCacheRepository.querySentimentsByTicker(ticker);
    const sentimentsInRange = filterSentimentsByDateRange(
      allSentiments,
      articlesInRange,
      startDate,
      endDate
    );

    const dailySentiment = aggregateDailySentiment(sentimentsInRange, articlesInRange);

    onProgress?.({
      step: 'Complete',
      current: 100,
      total: 100,
    });

    return {
      ticker,
      articlesProcessed: articlesToAnalyze.length,
      articlesSkipped: articlesCached.length,
      articlesNotFound: allArticles.length - articlesInRange.length,
      dailySentiment,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    console.error('[SentimentProcessingService] Error processing sentiment:', error, {
      ticker,
      startDate,
      endDate,
    });
    throw error;
  }
}

/**
 * Filter articles by date range
 */
function filterArticlesByDateRange(
  articles: NewsCacheItem[],
  startDate: string,
  endDate: string
): NewsCacheItem[] {
  return articles.filter((article) => {
    const articleDate = article.article.date;
    return articleDate >= startDate && articleDate <= endDate;
  });
}

/**
 * Partition articles into those needing analysis vs already cached
 */
async function partitionArticlesByCache(
  ticker: string,
  articles: NewsCacheItem[]
): Promise<{
  articlesToAnalyze: NewsCacheItem[];
  articlesCached: NewsCacheItem[];
}> {
  const articlesToAnalyze: NewsCacheItem[] = [];
  const articlesCached: NewsCacheItem[] = [];

  // Check each article for existing sentiment
  // Note: Could be optimized with BatchGetItem for large batches
  const existenceChecks = articles.map(async (article) => {
    const exists = await SentimentCacheRepository.existsInCache(
      ticker,
      article.articleHash
    );
    return { article, exists };
  });

  const results = await Promise.all(existenceChecks);

  for (const { article, exists } of results) {
    if (exists) {
      articlesCached.push(article);
    } else {
      articlesToAnalyze.push(article);
    }
  }

  return { articlesToAnalyze, articlesCached };
}

/**
 * Analyze articles and return sentiment cache items
 *
 * Uses hybrid error handling:
 * 1. Try batch analysis
 * 2. If batch fails, retry once
 * 3. If still fails, analyze articles individually to get partial success
 *
 * @returns Successful cache items (may be partial if some articles failed)
 */
async function analyzeArticles(
  ticker: string,
  articles: NewsCacheItem[]
): Promise<Omit<SentimentCacheItem, 'ttl'>[]> {
  if (articles.length === 0) {
    return [];
  }

  // Prepare articles for batch analysis
  const articlesForAnalysis = articles.map((item) => ({
    text: `${item.article.title || ''} ${item.article.description || ''}`.trim(),
    hash: item.articleHash,
  }));

  // Try batch analysis with one retry
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const sentimentResults = await analyzeSentimentBatch(articlesForAnalysis);

      // Convert to cache format
      const cacheItems: Omit<SentimentCacheItem, 'ttl'>[] = sentimentResults.map(
        (result) => ({
          ticker,
          articleHash: result.articleHash,
          sentiment: {
            positive: parseInt(result.sentiment.positive[0]),
            negative: parseInt(result.sentiment.negative[0]),
            sentimentScore: result.sentimentScore,
            classification: result.classification,
          },
          analyzedAt: Date.now(),
        })
      );

      return cacheItems;
    } catch (error) {
      if (attempt === 1) {
        console.warn('[SentimentProcessingService] Batch analysis failed, retrying...', {
          ticker,
          articleCount: articles.length,
          error: error instanceof Error ? error.message : String(error),
        });
        // Will retry
      } else {
        console.error('[SentimentProcessingService] Batch analysis failed after retry, switching to per-article analysis', {
          ticker,
          articleCount: articles.length,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to per-article analysis
      }
    }
  }

  // Batch failed twice - analyze articles individually for partial success
  const results = await Promise.allSettled(
    articlesForAnalysis.map(async (article) => {
      const sentimentResult = await analyzeSentiment(article.text, article.hash);

      return {
        ticker,
        articleHash: sentimentResult.articleHash,
        sentiment: {
          positive: parseInt(sentimentResult.sentiment.positive[0]),
          negative: parseInt(sentimentResult.sentiment.negative[0]),
          sentimentScore: sentimentResult.sentimentScore,
          classification: sentimentResult.classification,
        },
        analyzedAt: Date.now(),
      } as Omit<SentimentCacheItem, 'ttl'>;
    })
  );

  // Collect successful results and log failures
  const successfulItems: Omit<SentimentCacheItem, 'ttl'>[] = [];
  const failedHashes: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      successfulItems.push(result.value);
    } else {
      failedHashes.push(articlesForAnalysis[index].hash);
      console.error('[SentimentProcessingService] Failed to analyze article:', {
        ticker,
        articleHash: articlesForAnalysis[index].hash,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  if (failedHashes.length > 0) {
    console.warn('[SentimentProcessingService] Partial success in article analysis', {
      ticker,
      totalArticles: articles.length,
      successful: successfulItems.length,
      failed: failedHashes.length,
      failedHashes: failedHashes.slice(0, 5), // Log first 5 failed hashes
    });
  }

  return successfulItems;
}

/**
 * Filter sentiments by matching article hashes in date range
 */
function filterSentimentsByDateRange(
  sentiments: SentimentCacheItem[],
  articles: NewsCacheItem[],
  startDate: string,
  endDate: string
): SentimentCacheItem[] {
  // Create set of article hashes in date range
  const articleHashesInRange = new Set(
    articles
      .filter((a) => a.article.date >= startDate && a.article.date <= endDate)
      .map((a) => a.articleHash)
  );

  // Filter sentiments to only those matching articles in range
  return sentiments.filter((s) => articleHashesInRange.has(s.articleHash));
}

// Note: aggregateDailySentiment is now imported from utils/sentiment.util.ts
// to avoid duplication with handler logic and ensure consistent classification thresholds

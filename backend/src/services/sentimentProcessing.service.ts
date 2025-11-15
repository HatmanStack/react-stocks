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
import { analyzeSentimentBatch } from '../ml/sentiment/analyzer.js';
import type {
  NewsCacheItem,
  SentimentCacheItem,
  SentimentData,
} from '../repositories/index.js';

/**
 * Daily aggregated sentiment result
 */
export interface DailySentiment {
  date: string;
  positive: number;
  negative: number;
  sentimentScore: number;
  classification: 'POS' | 'NEG' | 'NEUT';
  articleCount: number;
}

/**
 * Result of sentiment processing operation
 */
export interface SentimentProcessingResult {
  ticker: string;
  articlesProcessed: number;
  articlesSkipped: number; // Already cached
  articlesNotFound: number; // News not in cache
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
 */
async function analyzeArticles(
  ticker: string,
  articles: NewsCacheItem[]
): Promise<Omit<SentimentCacheItem, 'ttl'>[]> {
  if (articles.length === 0) {
    return [];
  }

  try {
    // Prepare articles for batch analysis
    const articlesForAnalysis = articles.map((item) => ({
      text: `${item.article.title || ''} ${item.article.description || ''}`.trim(),
      hash: item.articleHash,
    }));

    // Analyze in parallel
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
    console.error('[SentimentProcessingService] Error analyzing articles:', error, {
      ticker,
      articleCount: articles.length,
    });

    // Return partial results if some analyses failed
    // This allows processing to continue even if some articles fail
    return [];
  }
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

/**
 * Aggregate sentiment by date
 *
 * Groups article-level sentiment into daily aggregates
 */
function aggregateDailySentiment(
  sentiments: SentimentCacheItem[],
  articles: NewsCacheItem[]
): DailySentiment[] {
  // Create map of articleHash -> article date
  const articleDateMap = new Map<string, string>();
  for (const article of articles) {
    articleDateMap.set(article.articleHash, article.article.date);
  }

  // Group sentiments by date
  const dailyGroups = new Map<string, SentimentData[]>();

  for (const sentiment of sentiments) {
    const date = articleDateMap.get(sentiment.articleHash);
    if (!date) continue; // Skip if article not found

    if (!dailyGroups.has(date)) {
      dailyGroups.set(date, []);
    }
    dailyGroups.get(date)!.push(sentiment.sentiment);
  }

  // Aggregate each day's sentiments
  const dailySentiments: DailySentiment[] = [];

  for (const [date, sentiments] of dailyGroups.entries()) {
    const totalPositive = sentiments.reduce((sum, s) => sum + s.positive, 0);
    const totalNegative = sentiments.reduce((sum, s) => sum + s.negative, 0);
    const totalArticles = sentiments.length;

    // Calculate aggregate sentiment score
    const totalSentences = totalPositive + totalNegative;
    const sentimentScore =
      totalSentences > 0 ? (totalPositive - totalNegative) / totalSentences : 0;

    // Classify overall daily sentiment
    let classification: 'POS' | 'NEG' | 'NEUT';
    if (sentimentScore > 0.1) {
      classification = 'POS';
    } else if (sentimentScore < -0.1) {
      classification = 'NEG';
    } else {
      classification = 'NEUT';
    }

    dailySentiments.push({
      date,
      positive: totalPositive,
      negative: totalNegative,
      sentimentScore,
      classification,
      articleCount: totalArticles,
    });
  }

  // Sort by date
  return dailySentiments.sort((a, b) => a.date.localeCompare(b.date));
}

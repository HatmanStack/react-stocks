/**
 * Sentiment Data Fetcher
 *
 * Implements the data source hierarchy: Local SQLite → Backend API.
 * Handles quality validation, backend fallback, transformation, and hydration.
 */

import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import {
  getSentimentResults,
  getArticleSentiment,
  fetchLambdaNews,
  triggerSentimentAnalysis,
} from '@/services/api/lambdaSentiment.service';
import { Environment } from '@/config/environment';
import { validateCombinedData, validateArticleData } from '@/utils/sentiment/dataValidator';
import { transformLambdaToLocal, transformArticleToLocal } from '@/utils/sentiment/dataTransformer';
import { hydrateCombinedWordData, hydrateArticleData } from '@/services/data/databaseHydrator';
import type { CombinedWordDetails, WordCountDetails } from '@/types/database.types';

export interface FetchSentimentOptions {
  /** Whether fetching article-level data (vs daily aggregated) */
  articles?: boolean;
}

/**
 * Fetch combined (daily) sentiment data with local-first fallback to backend.
 */
export async function fetchCombinedSentiment(
  ticker: string,
  startDate: string,
  endDate: string,
  days: number,
): Promise<CombinedWordDetails[]> {
  // Step 1: Check local SQLite
  const localData = await CombinedWordRepository.findByTickerAndDateRange(
    ticker,
    startDate,
    endDate,
  );

  const quality = validateCombinedData(localData, days);

  if (quality.isAcceptable) {
    console.log(
      `[SentimentFetcher] Using ${localData.length} local records for ${ticker} (coverage: ${(quality.coverageRatio * 100).toFixed(0)}%)`,
    );
    return localData;
  }

  // Step 2: Fall back to backend API
  if (Environment.USE_LAMBDA_SENTIMENT) {
    console.log(
      `[SentimentFetcher] Local insufficient: ${quality.reasons.join(', ')}. Fetching backend.`,
    );

    try {
      // Trigger news + sentiment pipeline with polling
      try {
        await fetchLambdaNews(ticker, startDate, endDate);
        const triggerResult = await triggerSentimentAnalysis({ ticker, startDate, endDate });

        // Poll for completion with exponential backoff
        if (triggerResult.status !== 'COMPLETED') {
          const maxAttempts = 10;
          const baseDelay = 500;
          const maxDelay = 5000;

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
            await new Promise((resolve) => setTimeout(resolve, delay));

            try {
              const statusResult = await triggerSentimentAnalysis({ ticker, startDate, endDate });
              if (statusResult.status === 'COMPLETED' || statusResult.status === 'FAILED') {
                break;
              }
            } catch {
              // Continue polling on transient errors
            }
          }
        }
      } catch (newsErr) {
        console.warn(`[SentimentFetcher] News/sentiment trigger failed: ${newsErr}`);
      }

      const lambdaResults = await getSentimentResults(ticker, startDate, endDate);

      if (lambdaResults.dailySentiment.length > 0) {
        console.log(
          `[SentimentFetcher] Backend returned ${lambdaResults.dailySentiment.length} records`,
        );
        const transformed = transformLambdaToLocal(lambdaResults.dailySentiment, ticker);
        hydrateCombinedWordData(transformed);
        return transformed;
      }
    } catch (error) {
      console.warn('[SentimentFetcher] Backend unavailable:', error);
      if (localData.length > 0) return localData;
    }
  } else {
    console.log(
      `[SentimentFetcher] No backend configured, using ${localData.length} local records`,
    );
  }

  return localData;
}

/**
 * Fetch article-level sentiment data with local-first fallback to backend.
 */
export async function fetchArticleSentiment(
  ticker: string,
  startDate: string,
  endDate: string,
  days: number,
): Promise<WordCountDetails[]> {
  // Step 1: Check local SQLite
  const allLocalData = await WordCountRepository.findByTicker(ticker);
  const localData = allLocalData.filter((item) => item.date >= startDate && item.date <= endDate);

  const quality = validateArticleData(localData, days);

  if (quality.isAcceptable) {
    console.log(
      `[SentimentFetcher] Using ${localData.length} local articles for ${ticker} (coverage: ${(quality.coverageRatio * 100).toFixed(0)}%)`,
    );
    return localData;
  }

  // Step 2: Fall back to backend API
  if (Environment.USE_LAMBDA_SENTIMENT) {
    console.log(
      `[SentimentFetcher] Articles insufficient: ${quality.reasons.join(', ')}. Fetching backend.`,
    );

    try {
      const lambdaResults = await getArticleSentiment(ticker, startDate, endDate);

      if (lambdaResults.articles.length > 0) {
        console.log(
          `[SentimentFetcher] Backend returned ${lambdaResults.articles.length} articles`,
        );
        const transformed = lambdaResults.articles.map((article, index) =>
          transformArticleToLocal(article, index),
        );
        hydrateArticleData(transformed);
        return transformed;
      }
    } catch (error) {
      console.warn('[SentimentFetcher] Backend unavailable:', error);
    }
  }

  console.log(`[SentimentFetcher] Returning ${localData.length} local articles for ${ticker}`);
  return localData;
}

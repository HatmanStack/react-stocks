/**
 * Synchronization Orchestrator
 * Coordinates the full data pipeline: stock prices → news → sentiment analysis
 */

import { syncStockData } from './stockDataSync';
import { syncNewsData } from './newsDataSync';
import { syncSentimentData } from './sentimentDataSync';
import { triggerSentimentAnalysis } from '@/services/api/lambdaSentiment.service';
import { Environment } from '@/config/environment';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { getDatesInRange } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';

/**
 * Progress callback for UI feedback
 */
export type SyncProgressCallback = (status: {
  step: string;
  progress: number;
  total: number;
  message: string;
}) => void;

/**
 * Sync result with statistics
 */
export interface SyncResult {
  ticker: string;
  stockRecords: number;
  newsArticles: number;
  sentimentAnalyses: number; // Deprecated when using Lambda (will be 0)
  sentimentJobId?: string; // Lambda job ID for tracking async sentiment
  daysProcessed: number;
  errors: string[];
}

/**
 * Perform local sentiment analysis (fallback or when Lambda disabled)
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date
 * @param endDate - End date
 * @param result - Sync result object to update
 * @param onProgress - Optional progress callback
 */
async function performLocalSentimentAnalysis(
  ticker: string,
  startDate: string,
  endDate: string,
  result: SyncResult,
  onProgress?: SyncProgressCallback
): Promise<void> {
  try {
    const dates = getDatesInRange(startDate, endDate);
    let totalAnalyses = 0;

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];

      try {
        const analyzed = await syncSentimentData(ticker, date);
        totalAnalyses += analyzed;

        // Update progress for each date
        onProgress?.({
          step: 'sentiment',
          progress: 2 + (i / dates.length),
          total: 3,
          message: `Analyzing sentiment locally: ${i + 1}/${dates.length} days...`,
        });
      } catch (error) {
        console.error(
          `[SyncOrchestrator] Local sentiment sync failed for ${ticker} on ${date}:`,
          error
        );
        result.errors.push(`Sentiment analysis failed for ${date}: ${error}`);
        // Continue with next date
      }
    }

    result.sentimentAnalyses = totalAnalyses;
    result.daysProcessed = dates.length;

    console.log(
      `[SyncOrchestrator] Local sentiment sync complete: ${result.sentimentAnalyses} analyses across ${result.daysProcessed} days`
    );
  } catch (error) {
    const errorMsg = `Local sentiment sync failed: ${error}`;
    console.error(`[SyncOrchestrator] ${errorMsg}`);
    result.errors.push(errorMsg);
  }
}

/**
 * Sync all data for a ticker (prices, news, sentiment)
 * @param ticker - Stock ticker symbol
 * @param days - Number of days to sync (default: 30)
 * @param onProgress - Optional progress callback for UI updates
 * @returns Sync result with statistics
 */
export async function syncAllData(
  ticker: string,
  days: number = 30,
  onProgress?: SyncProgressCallback
): Promise<SyncResult> {
  const result: SyncResult = {
    ticker,
    stockRecords: 0,
    newsArticles: 0,
    sentimentAnalyses: 0,
    daysProcessed: 0,
    errors: [],
  };

  try {
    console.log(`[SyncOrchestrator] Starting full sync for ${ticker} (${days} days)`);

    // Calculate date range
    const endDate = formatDateForDB(new Date());
    const startDate = formatDateForDB(subDays(new Date(), days));

    // Step 1: Sync stock prices
    onProgress?.({
      step: 'stock',
      progress: 0,
      total: 3,
      message: `Fetching stock prices for ${ticker}...`,
    });

    try {
      result.stockRecords = await syncStockData(ticker, startDate, endDate);
      console.log(`[SyncOrchestrator] Stock sync complete: ${result.stockRecords} records`);
    } catch (error) {
      const errorMsg = `Stock sync failed: ${error}`;
      console.error(`[SyncOrchestrator] ${errorMsg}`);
      result.errors.push(errorMsg);
      // Continue with other steps even if stock sync fails
    }

    // Step 2: Sync news articles
    onProgress?.({
      step: 'news',
      progress: 1,
      total: 3,
      message: `Fetching news articles for ${ticker}...`,
    });

    try {
      result.newsArticles = await syncNewsData(ticker, startDate, endDate);
      console.log(`[SyncOrchestrator] News sync complete: ${result.newsArticles} articles`);
    } catch (error) {
      const errorMsg = `News sync failed: ${error}`;
      console.error(`[SyncOrchestrator] ${errorMsg}`);
      result.errors.push(errorMsg);
      // Continue to sentiment analysis even if news sync fails
    }

    // Step 3: Trigger sentiment analysis (Lambda or local)
    onProgress?.({
      step: 'sentiment',
      progress: 2,
      total: 3,
      message: `Triggering sentiment analysis for ${ticker}...`,
    });

    // Check if Lambda sentiment is enabled
    if (Environment.USE_LAMBDA_SENTIMENT) {
      // Use Lambda for sentiment analysis (async, non-blocking)
      try {
        const response = await triggerSentimentAnalysis({
          ticker,
          startDate,
          endDate,
        });

        result.sentimentJobId = response.jobId;
        result.daysProcessed = getDatesInRange(startDate, endDate).length;

        onProgress?.({
          step: 'sentiment',
          progress: 2.5,
          total: 3,
          message: `Sentiment analysis started (Job: ${response.jobId.substring(0, 20)}...)`,
        });

        console.log(
          `[SyncOrchestrator] Lambda sentiment analysis triggered: Job ID ${response.jobId}, Status: ${response.status}`
        );
      } catch (error) {
        const errorMsg = `Lambda sentiment trigger failed: ${error}`;
        console.warn(`[SyncOrchestrator] ${errorMsg}, falling back to local analysis`);
        result.errors.push(errorMsg);

        // Fallback to local sentiment analysis
        await performLocalSentimentAnalysis(
          ticker,
          startDate,
          endDate,
          result,
          onProgress
        );
      }
    } else {
      // Use local sentiment analysis
      console.log('[SyncOrchestrator] Using local sentiment analysis');
      await performLocalSentimentAnalysis(
        ticker,
        startDate,
        endDate,
        result,
        onProgress
      );
    }

    // Complete
    onProgress?.({
      step: 'complete',
      progress: 3,
      total: 3,
      message: `Sync complete for ${ticker}`,
    });

    console.log(
      `[SyncOrchestrator] Full sync complete for ${ticker}:`,
      JSON.stringify(result, null, 2)
    );

    return result;
  } catch (error) {
    console.error(`[SyncOrchestrator] Fatal error during sync for ${ticker}:`, error);
    result.errors.push(`Fatal sync error: ${error}`);
    throw new Error(`Sync failed for ${ticker}: ${error}`);
  }
}

/**
 * Sync multiple tickers sequentially
 * @param tickers - Array of ticker symbols
 * @param days - Number of days to sync for each ticker
 * @param onProgress - Optional progress callback
 * @returns Map of ticker to sync result
 */
export async function syncMultipleTickers(
  tickers: string[],
  days: number = 30,
  onProgress?: SyncProgressCallback
): Promise<Map<string, SyncResult>> {
  const results = new Map<string, SyncResult>();

  console.log(`[SyncOrchestrator] Syncing ${tickers.length} tickers: ${tickers.join(', ')}`);

  for (let i = 0; i < tickers.length; i++) {
    const ticker = tickers[i];

    try {
      onProgress?.({
        step: 'ticker',
        progress: i,
        total: tickers.length,
        message: `Syncing ${ticker} (${i + 1}/${tickers.length})...`,
      });

      const result = await syncAllData(ticker, days, onProgress);
      results.set(ticker, result);
    } catch (error) {
      console.error(`[SyncOrchestrator] Failed to sync ${ticker}:`, error);
      results.set(ticker, {
        ticker,
        stockRecords: 0,
        newsArticles: 0,
        sentimentAnalyses: 0,
        daysProcessed: 0,
        errors: [`Failed to sync: ${error}`],
      });
    }
  }

  return results;
}

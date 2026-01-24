/**
 * React Query Hooks for Sentiment Analysis Data
 * Fetches word count and aggregated sentiment data
 *
 * Data source hierarchy: Local SQLite → Backend API
 * Predictions are generated client-side using browser-based logistic regression.
 */

import { useQuery } from '@tanstack/react-query';
import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import * as StockRepository from '@/database/repositories/stock.repository';
import { updatePredictions } from '@/services/sync/sentimentDataSync';
import { syncStockData } from '@/services/sync/stockDataSync';
import { getSentimentResults, getArticleSentiment, fetchLambdaNews, triggerSentimentAnalysis, type DailySentiment } from '@/services/api/lambdaSentiment.service';
import { Environment } from '@/config/environment';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import type { WordCountDetails, CombinedWordDetails, EventType } from '@/types/database.types';
import { getStockPredictions, parsePredictionResponse } from '@/ml/prediction/prediction.service';

interface Predictions {
    nextDay: { direction: 'up' | 'down'; probability: number } | null;
    twoWeek: { direction: 'up' | 'down'; probability: number } | null;
    oneMonth: { direction: 'up' | 'down'; probability: number } | null;
}

/** Minimum sentiment records to attempt predictions (interpolation fills gaps) */
const MIN_SENTIMENT_DATA = 25;

/** Minimum stock trading days needed for prediction model (TREND_WINDOW + horizon + labels) */
const MIN_STOCK_DATA = 46;

/**
 * Generate predictions using browser-based logistic regression
 * @param ticker - Stock ticker symbol
 * @param sentimentData - Combined sentiment data
 * @returns Predictions or null if insufficient data
 */
async function generateBrowserPredictions(
  ticker: string,
  sentimentData: CombinedWordDetails[],
  days: number
): Promise<Predictions | null> {
  console.log(`[Predictions] === Starting prediction generation for ${ticker} ===`);
  console.log(`[Predictions] Sentiment data length: ${sentimentData.length}`);

  try {
    // Step 1: Validate sentiment data length
    if (sentimentData.length < MIN_SENTIMENT_DATA) {
      console.log(`[Predictions] FAIL: Insufficient sentiment data for ${ticker}: ${sentimentData.length} days (need ${MIN_SENTIMENT_DATA})`);
      return null;
    }

    // Fetch enough stock data for the model (at least MIN_STOCK_DATA trading days)
    // Use user's timeframe if larger, otherwise expand to minimum needed
    const minCalendarDays = Math.ceil(MIN_STOCK_DATA * 1.5); // ~69 calendar days for 46 trading days
    const effectiveDays = Math.max(days, minCalendarDays);
    const stockEndStr = formatDateForDB(new Date());
    const stockStartStr = formatDateForDB(subDays(new Date(), effectiveDays));

    console.log(`[Predictions] Syncing stock data for ${ticker} from ${stockStartStr} to ${stockEndStr} (${effectiveDays} cal days, requested ${days})...`);
    try {
      await syncStockData(ticker, stockStartStr, stockEndStr, MIN_STOCK_DATA);
    } catch (syncError) {
      console.warn(`[Predictions] Stock sync failed, using local data:`, syncError);
    }

    const stockData = await StockRepository.findByTickerAndDateRange(
      ticker,
      stockStartStr,
      stockEndStr
    );
    console.log(`[Predictions] Stock data length: ${stockData.length} (for range ${stockStartStr} to ${stockEndStr})`);

    if (stockData.length < MIN_STOCK_DATA) {
      console.log(`[Predictions] FAIL: Insufficient stock data for ${ticker}: ${stockData.length} days (need ${MIN_STOCK_DATA})`);
      return null;
    }

    // Step 2: Sort both datasets by date (oldest first for time-series)
    const sortedStocks = [...stockData].sort((a, b) => a.date.localeCompare(b.date));
    const sortedSentiment = [...sentimentData].sort((a, b) => a.date.localeCompare(b.date));

    // Step 3: Compute overlapping date range and align datasets
    const stockStartDate = sortedStocks[0].date;
    const stockEndDate = sortedStocks[sortedStocks.length - 1].date;
    const sentimentStartDate = sortedSentiment[0].date;
    const sentimentEndDate = sortedSentiment[sortedSentiment.length - 1].date;

    console.log(`[Predictions] Stock date range: ${stockStartDate} to ${stockEndDate}`);
    console.log(`[Predictions] Sentiment date range: ${sentimentStartDate} to ${sentimentEndDate}`);

    // Find overlapping range (max of start dates, min of end dates)
    const overlapStart = stockStartDate > sentimentStartDate ? stockStartDate : sentimentStartDate;
    const overlapEnd = stockEndDate < sentimentEndDate ? stockEndDate : sentimentEndDate;

    if (overlapStart > overlapEnd) {
      console.log(`[Predictions] FAIL: No overlapping date range between stock and sentiment data`);
      return null;
    }

    console.log(`[Predictions] Overlapping date range: ${overlapStart} to ${overlapEnd}`);

    // Create date-indexed maps for efficient lookup
    const stockByDate = new Map(sortedStocks.map(s => [s.date, s]));
    const sentimentByDate = new Map(sortedSentiment.map(s => [s.date, s]));

    // Use ALL stock trading days (not limited to overlap) - we'll interpolate sentiment
    const tradingDays = [...stockByDate.keys()].sort();
    const sentimentDates = [...sentimentByDate.keys()].sort();
    const firstSentimentDate = sentimentDates[0];
    const lastSentimentDate = sentimentDates[sentimentDates.length - 1];

    console.log(`[Predictions] Using ${tradingDays.length} trading days with sentiment interpolation`);

    // For each trading day, find sentiment using interpolation:
    // - Exact match if available
    // - Forward-fill: use most recent prior sentiment
    // - Backfill: use earliest sentiment for dates before first sentiment
    const trimmedStocks: typeof sortedStocks = [];
    const trimmedSentiment: typeof sortedSentiment = [];

    for (const tradingDay of tradingDays) {
      const stock = stockByDate.get(tradingDay)!;
      let sentiment = sentimentByDate.get(tradingDay);

      if (!sentiment) {
        if (tradingDay < firstSentimentDate) {
          // Backfill: use earliest sentiment
          sentiment = sentimentByDate.get(firstSentimentDate);
        } else if (tradingDay > lastSentimentDate) {
          // Forward-fill past end: use latest sentiment
          sentiment = sentimentByDate.get(lastSentimentDate);
        } else {
          // Forward-fill: use most recent prior sentiment
          const priorDates = sentimentDates.filter(d => d <= tradingDay);
          if (priorDates.length > 0) {
            sentiment = sentimentByDate.get(priorDates[priorDates.length - 1]);
          }
        }
      }

      if (sentiment) {
        trimmedStocks.push(stock);
        trimmedSentiment.push(sentiment);
      }
    }

    console.log(`[Predictions] After alignment with interpolation: ${trimmedStocks.length} trading days`);

    // Step 4: Re-check that trimmed arrays meet minimum requirement
    if (trimmedStocks.length < MIN_STOCK_DATA) {
      console.log(`[Predictions] FAIL: After alignment, insufficient data: ${trimmedStocks.length} days (need ${MIN_STOCK_DATA})`);
      return null;
    }

    // Extract features from trimmed, aligned data
    const closePrices = trimmedStocks.map(s => s.close);
    const volumes = trimmedStocks.map(s => s.volume);

    // Extract three-signal sentiment data (defaults to neutral if not available)
    const eventTypes: EventType[] = [];
    const aspectScores: number[] = [];
    const mlScores: number[] = [];
    const signalScores: number[] = [];

    for (const day of trimmedSentiment) {
      // Parse dominant event type from eventCounts JSON
      let dominantEvent: EventType = 'GENERAL';
      if (day.eventCounts) {
        try {
          const counts = JSON.parse(day.eventCounts) as Record<string, number>;
          const nonGeneral = Object.entries(counts).filter(([t]) => t !== 'GENERAL');
          if (nonGeneral.length > 0) {
            const [type] = nonGeneral.reduce((max, curr) => curr[1] > max[1] ? curr : max);
            dominantEvent = type as EventType;
          }
        } catch {
          // Use default GENERAL
        }
      }
      eventTypes.push(dominantEvent);
      aspectScores.push(day.avgAspectScore ?? 0);
      mlScores.push(day.avgMlScore ?? 0);
      signalScores.push(day.avgSignalScore ?? 0.5); // Default 0.5 (neutral)
    }

    // Calculate sentiment availability for logging
    const sentimentAvailability = mlScores.filter(s => s !== 0).length / mlScores.length;

    console.log(`[Predictions] Feature extraction complete:`);
    console.log(`[Predictions]   - closePrices: ${closePrices.length} points, range: [${Math.min(...closePrices).toFixed(2)}, ${Math.max(...closePrices).toFixed(2)}]`);
    console.log(`[Predictions]   - volumes: ${volumes.length} points`);
    console.log(`[Predictions]   - eventTypes: ${eventTypes.length} (unique: ${[...new Set(eventTypes)].join(', ')})`);
    console.log(`[Predictions]   - aspectScores: ${aspectScores.length} (non-zero: ${aspectScores.filter(s => s !== 0).length})`);
    console.log(`[Predictions]   - mlScores: ${mlScores.length} (non-zero: ${mlScores.filter(s => s !== 0).length})`);
    console.log(`[Predictions]   - signalScores: ${signalScores.length}`);
    console.log(`[Predictions]   - sentimentAvailability: ${(sentimentAvailability * 100).toFixed(1)}%`);

    // Run browser-based logistic regression
    console.log(`[Predictions] Calling getStockPredictions...`);
    const response = await getStockPredictions(
      ticker,
      closePrices,
      volumes,
      [], // deprecated
      [], // deprecated
      [], // deprecated
      eventTypes,
      aspectScores,
      mlScores,
      signalScores
    );
    console.log(`[Predictions] Raw response:`, response);

    const parsed = parsePredictionResponse(response);
    console.log(`[Predictions] Parsed response:`, parsed);

    // Convert to Predictions format with direction and probability
    // The model outputs 0 (up) or 1 (down), we convert to probability
    // Returns null for horizons with insufficient data
    const toPrediction = (value: number | null): { direction: 'up' | 'down'; probability: number } | null => {
      if (value == null) return null;
      const isDown = value >= 0.5;
      return {
        direction: isDown ? 'down' : 'up',
        probability: isDown ? value : (1 - value),
      };
    };

    const predictions: Predictions = {
      nextDay: toPrediction(parsed.nextDay),
      twoWeek: toPrediction(parsed.twoWeeks),
      oneMonth: toPrediction(parsed.oneMonth),
    };

    console.log(`[Predictions] Generated for ${ticker}:`, predictions);
    return predictions;
  } catch (error) {
    console.error(`[Predictions] Failed to generate predictions for ${ticker}:`, error);
    return null;
  }
}

export interface UseSentimentDataOptions {
  /**
   * Number of days of sentiment data to fetch
   * Default: 30 days
   */
  days?: number;

  /**
   * Whether to enable the query
   * Default: true
   */
  enabled?: boolean;

  /**
   * Custom stale time in milliseconds
   * Default: uses React Query default (5 minutes)
   */
  staleTime?: number;
}

/**
 * Classify sentiment score into POS/NEG/NEUT
 */
function classifySentiment(score: number): 'POS' | 'NEG' | 'NEUT' {
  if (score > 0.1) return 'POS';
  if (score < -0.1) return 'NEG';
  return 'NEUT';
}

/**
 * Transform Lambda DailySentiment format to local CombinedWordDetails format
 * Maps three-signal sentiment data (eventCounts, avgAspectScore, avgMlScore)
 *
 * @param dailySentiment - Sentiment data from Lambda with three-signal architecture
 * @param ticker - Stock ticker symbol
 * @returns Array of CombinedWordDetails for database storage
 *
 * @see docs/plans/Phase-5.md Task 2 for transformation rationale
 */
function transformLambdaToLocal(
  dailySentiment: DailySentiment[],
  ticker: string,
  predictions?: Predictions
): CombinedWordDetails[] {
  // Sort by date ascending to find the latest
  const sorted = [...dailySentiment].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = sorted.length > 0 ? sorted[sorted.length - 1].date : '';

  return sorted.map((day) => {
    const isLatest = day.date === latestDate;

    // Apply predictions to the latest record if available
    const nextDay = (isLatest && predictions) ? 0 : 0; // Legacy numeric field - keep as 0
    const twoWks = (isLatest && predictions) ? 0 : 0;
    const oneMnth = (isLatest && predictions) ? 0 : 0;

    const record: CombinedWordDetails = {
        // Primary keys
        date: day.date,
        ticker,

        // Legacy fields (map from backend field names)
        positive: day.positiveCount,
        negative: day.negativeCount,
        sentimentNumber: day.sentimentScore,
        sentiment: classifySentiment(day.sentimentScore),

        // Legacy numeric predictions (deprecated but required by type)
        nextDay,
        twoWks,
        oneMnth,
        updateDate: formatDateForDB(new Date()),

        // Phase 5: Three-signal sentiment (NEW)
        // Store eventCounts as JSON string for SQLite compatibility
        eventCounts: day.eventCounts ? JSON.stringify(day.eventCounts) : undefined,
        avgAspectScore: day.avgAspectScore ?? null,
        avgMlScore: day.avgMlScore ?? null,
        materialEventCount: day.materialEventCount ?? 0,
        avgSignalScore: day.avgSignalScore ?? null,
    };

    // Add Phase 2 prediction fields if this is the latest record and predictions exist
    if (isLatest && predictions) {
        if (predictions.nextDay) {
          record.nextDayDirection = predictions.nextDay.direction;
          record.nextDayProbability = predictions.nextDay.probability;
        }
        if (predictions.twoWeek) {
          record.twoWeekDirection = predictions.twoWeek.direction;
          record.twoWeekProbability = predictions.twoWeek.probability;
        }
        if (predictions.oneMonth) {
          record.oneMonthDirection = predictions.oneMonth.direction;
          record.oneMonthProbability = predictions.oneMonth.probability;
        }
    }

    return record;
  });
}

/**
 * Hook to fetch aggregated daily sentiment data
 * Returns CombinedWordDetails with daily positive/negative counts and scores
 *
 * @param ticker - Stock ticker symbol
 * @param options - Optional configuration
 * @returns React Query result with combined sentiment data
 *
 * @example
 * ```tsx
 * function SentimentChart({ ticker }: { ticker: string }) {
 *   const { data: sentiment, isLoading } = useSentimentData(ticker, { days: 60 });
 *
 *   if (isLoading) return <ActivityIndicator />;
 *
 *   return (
 *     <LineChart
 *       data={sentiment?.map(s => ({
 *         date: s.date,
 *         score: s.sentimentNumber,
 *       }))}
 *     />
 *   );
 * }
 * ```
 */
export function useSentimentData(
  ticker: string,
  options: UseSentimentDataOptions = {}
) {
  const { days = 30, enabled = true, staleTime } = options;

  return useQuery({
    queryKey: ['sentimentData', ticker, days],
    queryFn: async (): Promise<CombinedWordDetails[]> => {
      const endDate = formatDateForDB(new Date());
      const startDate = formatDateForDB(subDays(new Date(), days));

      console.log(`[useSentimentData] Fetching sentiment for ${ticker} from ${startDate} to ${endDate} (${days} days)`);

      let sentimentData: CombinedWordDetails[] = [];

      // STEP 1: Check local SQLite first
      const localData = await CombinedWordRepository.findByTickerAndDateRange(
        ticker,
        startDate,
        endDate
      );

      // HOLE 2 FIX: Check coverage ratio (not just record count)
      // HOLE 3 FIX: Check data freshness
      const hasPhase5Data = localData.some(d => d.avgSignalScore != null || d.avgMlScore != null);

      // Coverage: expect ~70% of days to have data (weekends excluded)
      const expectedDays = days * 0.7;
      const coverageRatio = localData.length / expectedDays;
      const hasGoodCoverage = coverageRatio >= 0.5; // At least 50% of expected

      // Freshness: check if latest record is recent (within 1 day)
      const today = formatDateForDB(new Date());
      const yesterday = formatDateForDB(subDays(new Date(), 1));
      const latestLocalDate = localData.length > 0
        ? localData.reduce((a, b) => a.date > b.date ? a : b).date
        : null;
      const isFresh = latestLocalDate && latestLocalDate >= yesterday;

      const hasEnoughData = localData.length >= 10 && hasPhase5Data && hasGoodCoverage && isFresh;

      if (hasEnoughData) {
        console.log(`[useSentimentData] Using ${localData.length} local records for ${ticker} (coverage: ${(coverageRatio * 100).toFixed(0)}%, latest: ${latestLocalDate})`);
        sentimentData = localData;
      }
      // STEP 2: Fall back to backend API if local data insufficient
      if (!hasEnoughData && Environment.USE_LAMBDA_SENTIMENT) {
        // Log why we're not using local data
        const reasons = [];
        if (localData.length < 10) reasons.push(`only ${localData.length} records`);
        if (localData.length >= 10 && !hasPhase5Data) reasons.push('lacks Phase 5 fields');
        if (localData.length >= 10 && !hasGoodCoverage) reasons.push(`low coverage (${(coverageRatio * 100).toFixed(0)}%)`);
        if (localData.length >= 10 && !isFresh) reasons.push(`stale (latest: ${latestLocalDate || 'none'})`);
        console.log(`[useSentimentData] Local data insufficient: ${reasons.join(', ')}. Fetching from backend for ${startDate} to ${endDate}`);

        try {
          // First fetch news for the date range (required for sentiment)
          try {
            console.log(`[useSentimentData] Fetching news for extended date range...`);
            await fetchLambdaNews(ticker, startDate, endDate);
            // Trigger sentiment analysis for new news
            const triggerResult = await triggerSentimentAnalysis({ ticker, startDate, endDate });

            // HOLE 1 FIX: Wait for job to complete if not already done
            if (triggerResult.status !== 'COMPLETED') {
              console.log(`[useSentimentData] Sentiment job ${triggerResult.jobId} is ${triggerResult.status}, waiting...`);
              // Wait for processing (sentiment analysis typically takes 2-5 seconds)
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          } catch (newsErr) {
            console.warn(`[useSentimentData] News/sentiment fetch failed: ${newsErr}`);
          }

          const lambdaResults = await getSentimentResults(ticker, startDate, endDate);

          if (lambdaResults.dailySentiment.length > 0) {
            console.log(`[useSentimentData] Backend returned ${lambdaResults.dailySentiment.length} records`);

            // Transform backend format to local format
            sentimentData = transformLambdaToLocal(lambdaResults.dailySentiment, ticker);

            // Don't preserve predictions - regenerate fresh with new data
            // This ensures predictions update when timeframe changes

            // HOLE 6 FIX: Hydrate local DB with better error handling
            // Run in background but track success/failure
            (async () => {
              try {
                let successCount = 0;
                let failCount = 0;
                for (const record of sentimentData) {
                  try {
                    await CombinedWordRepository.upsert(record);
                    successCount++;
                  } catch (err) {
                    failCount++;
                  }
                }
                if (failCount > 0) {
                  console.warn(`[useSentimentData] Hydration partial: ${successCount} succeeded, ${failCount} failed`);
                } else {
                  console.log(`[useSentimentData] Hydrated local DB: ${successCount} records`);
                }
              } catch (err) {
                console.warn('[useSentimentData] Hydration failed:', err);
              }
            })();
          }
        } catch (error) {
          console.warn('[useSentimentData] Backend unavailable:', error);
          // Use whatever local data we have
          if (localData.length > 0) {
            sentimentData = localData;
          }
        }
      } else if (!hasEnoughData) {
        // No backend configured, use whatever local data we have
        console.log(`[useSentimentData] No backend configured, using ${localData.length} local records`);
        sentimentData = localData;
      }

      // STEP 3: If still no data, log warning (don't trigger local analysis - use backend instead)
      if (sentimentData.length === 0) {
        console.log(`[useSentimentData] No sentiment data found for ${ticker}. Backend analysis required.`);
      }

      // STEP 4: Generate predictions using browser-based logistic regression
      // Always regenerate when timeframe changes (data length differs from cached)
      console.log(`[useSentimentData] STEP 4: Generating predictions for current timeframe...`);
      console.log(`[useSentimentData]   - sentimentData.length: ${sentimentData.length}`);
      console.log(`[useSentimentData]   - days parameter: ${days}`);

      // Find latest record without mutating sentimentData array
      const latestRecord = sentimentData.length > 0
        ? sentimentData.reduce((latest, current) =>
            current.date > latest.date ? current : latest
          )
        : null;

      // Always regenerate predictions for the current data window
      // Different timeframes = different data = different predictions
      const needsPredictions = latestRecord && sentimentData.length >= MIN_SENTIMENT_DATA;
      console.log(`[useSentimentData]   - needsPredictions: ${needsPredictions} (have ${sentimentData.length} days, need ${MIN_SENTIMENT_DATA})`);

      if (needsPredictions && sentimentData.length > 0) {
        console.log(`[useSentimentData] GENERATING browser-based predictions for ${ticker}`);
        const predictions = await generateBrowserPredictions(ticker, sentimentData, days);

        if (predictions && latestRecord) {
          console.log(`[useSentimentData] Predictions received:`, predictions);
          // Update latest record with predictions (clear stale values for null horizons)
          latestRecord.nextDayDirection = predictions.nextDay?.direction ?? undefined;
          latestRecord.nextDayProbability = predictions.nextDay?.probability ?? undefined;
          latestRecord.twoWeekDirection = predictions.twoWeek?.direction ?? undefined;
          latestRecord.twoWeekProbability = predictions.twoWeek?.probability ?? undefined;
          latestRecord.oneMonthDirection = predictions.oneMonth?.direction ?? undefined;
          latestRecord.oneMonthProbability = predictions.oneMonth?.probability ?? undefined;
          latestRecord.updateDate = formatDateForDB(new Date());
          console.log(`[useSentimentData] Updated latestRecord with predictions:`, {
            nextDayDirection: latestRecord.nextDayDirection ?? 'insufficient data',
            nextDayProbability: latestRecord.nextDayProbability,
            twoWeekDirection: latestRecord.twoWeekDirection ?? 'insufficient data',
            oneMonthDirection: latestRecord.oneMonthDirection ?? 'insufficient data',
          });

          // Store predictions in local SQLite (async, don't block)
          CombinedWordRepository.upsert(latestRecord)
            .then(() => console.log(`[useSentimentData] Stored predictions in local DB`))
            .catch(err => console.warn('[useSentimentData] Failed to store predictions:', err));

          // Also update portfolio predictions
          updatePredictions(ticker, predictions)
            .catch(err => console.warn('[useSentimentData] Failed to update portfolio predictions:', err));
        } else {
          console.log(`[useSentimentData] Predictions generation returned null or latestRecord is null`);
        }
      } else {
        console.log(`[useSentimentData] Skipping prediction generation (needsPredictions=${needsPredictions}, dataLength=${sentimentData.length})`);
      }

      return sentimentData;
    },
    enabled: enabled && !!ticker,
    staleTime: staleTime ?? 5 * 60 * 1000, // Default 5 minutes stale time
    refetchOnMount: false, // Don't refetch if data is fresh
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to fetch individual article sentiment (WordCountDetails)
 * Returns detailed word counts for each news article
 *
 * @param ticker - Stock ticker symbol
 * @param options - Optional configuration
 * @returns React Query result with article-level sentiment
 *
 * @example
 * ```tsx
 * function ArticleSentimentList({ ticker }: { ticker: string }) {
 *   const { data: articles } = useArticleSentiment(ticker, { days: 7 });
 *
 *   return (
 *     <FlatList
 *       data={articles}
 *       renderItem={({ item }) => (
 *         <View>
 *           <Text>Positive: {item.positive} | Negative: {item.negative}</Text>
 *           <Text>Sentiment: {item.sentiment}</Text>
 *         </View>
 *       )}
 *     />
 *   );
 * }
 * ```
 */
export function useArticleSentiment(
  ticker: string,
  options: UseSentimentDataOptions = {}
) {
  const { days = 7, enabled = true, staleTime } = options;

  return useQuery({
    queryKey: ['articleSentiment', ticker, days],
    queryFn: async (): Promise<WordCountDetails[]> => {
      const endDate = formatDateForDB(new Date());
      const startDate = formatDateForDB(subDays(new Date(), days));

      console.log(`[useArticleSentiment] Fetching article sentiment for ${ticker} from ${startDate} to ${endDate} (days=${days})`);

      // STEP 1: Check local SQLite first
      const allLocalData = await WordCountRepository.findByTicker(ticker);
      const localData = allLocalData.filter(
        (item) => item.date >= startDate && item.date <= endDate
      );

      // HOLE 5 FIX: Check data quality with coverage and freshness
      const hasPhase5Data = localData.some(item => item.signalScore != null || item.mlScore != null);
      const hasPublisherData = localData.some(item => item.publisher && item.url);

      // Coverage: expect ~2 articles per day on average
      const expectedArticles = days * 2;
      const coverageRatio = localData.length / expectedArticles;
      const hasGoodCoverage = coverageRatio >= 0.3; // At least 30% of expected

      // Freshness: check if latest article is recent
      const yesterday = formatDateForDB(subDays(new Date(), 1));
      const latestLocalDate = localData.length > 0
        ? localData.reduce((a, b) => a.date > b.date ? a : b).date
        : null;
      const isFresh = latestLocalDate && latestLocalDate >= yesterday;

      const hasQualityData = localData.length >= 5 && hasPublisherData &&
        hasPhase5Data && hasGoodCoverage && isFresh;

      if (hasQualityData) {
        console.log(`[useArticleSentiment] Using ${localData.length} local articles for ${ticker} (coverage: ${(coverageRatio * 100).toFixed(0)}%, latest: ${latestLocalDate})`);
        return localData;
      }

      // STEP 2: Fall back to backend API if local data insufficient
      if (Environment.USE_LAMBDA_SENTIMENT) {
        // Log why we're not using local data
        const reasons = [];
        if (localData.length < 5) reasons.push(`only ${localData.length} articles`);
        if (localData.length >= 5 && !hasPublisherData) reasons.push('missing publisher data');
        if (localData.length >= 5 && !hasPhase5Data) reasons.push('lacks Phase 5 fields');
        if (localData.length >= 5 && !hasGoodCoverage) reasons.push(`low coverage (${(coverageRatio * 100).toFixed(0)}%)`);
        if (localData.length >= 5 && !isFresh) reasons.push(`stale (latest: ${latestLocalDate || 'none'})`);

        try {
          console.log(`[useArticleSentiment] Local data insufficient: ${reasons.join(', ')}. Fetching from backend`);
          const lambdaResults = await getArticleSentiment(ticker, startDate, endDate);

          if (lambdaResults.articles.length > 0) {
            console.log(`[useArticleSentiment] Backend returned ${lambdaResults.articles.length} articles`);

            // Transform backend format to local WordCountDetails format
            const transformed: WordCountDetails[] = lambdaResults.articles.map((article, index) => ({
              date: article.date,
              hash: parseInt(article.hash.slice(0, 12), 16) || (Date.now() + index),
              ticker: article.ticker,
              title: article.title,
              url: article.url,
              publisher: article.publisher,
              positive: article.positive,
              negative: article.negative,
              body: article.body,
              sentiment: article.sentiment,
              sentimentNumber: article.sentimentNumber,
              nextDay: 0,
              twoWks: 0,
              oneMnth: 0,
              eventType: article.eventType as WordCountDetails['eventType'],
              aspectScore: article.aspectScore,
              mlScore: article.mlScore,
              signalScore: article.signalScore,
            }));

            // HOLE 6 FIX: Hydrate local DB with better error handling
            (async () => {
              try {
                let insertCount = 0;
                let skipCount = 0;
                let failCount = 0;
                for (const record of transformed) {
                  try {
                    const exists = await WordCountRepository.existsByHash(record.hash);
                    if (!exists) {
                      await WordCountRepository.insert(record);
                      insertCount++;
                    } else {
                      skipCount++;
                    }
                  } catch (err) {
                    failCount++;
                  }
                }
                if (failCount > 0) {
                  console.warn(`[useArticleSentiment] Hydration partial: ${insertCount} inserted, ${skipCount} skipped, ${failCount} failed`);
                } else {
                  console.log(`[useArticleSentiment] Hydrated local DB: ${insertCount} inserted, ${skipCount} already existed`);
                }
              } catch (err) {
                console.warn('[useArticleSentiment] Hydration failed:', err);
              }
            })();

            return transformed;
          }
        } catch (error) {
          console.warn('[useArticleSentiment] Backend unavailable:', error);
        }
      }

      // Return whatever local data we have (may be empty)
      console.log(`[useArticleSentiment] Returning ${localData.length} local records for ${ticker}`);
      return localData;
    },
    enabled: enabled && !!ticker,
    staleTime: staleTime ?? 5 * 60 * 1000, // Default 5 minutes stale time
    refetchOnMount: false, // Don't refetch if data is fresh
    refetchOnWindowFocus: false,
  });
}

/**
 * Hook to get current sentiment for a ticker
 * Returns the most recent CombinedWordDetails record
 *
 * @param ticker - Stock ticker symbol
 * @returns React Query result with current sentiment
 *
 * @example
 * ```tsx
 * function SentimentBadge({ ticker }: { ticker: string }) {
 *   const { data: sentiment } = useCurrentSentiment(ticker);
 *
 *   const color = sentiment?.sentiment === 'POS' ? 'green' :
 *                 sentiment?.sentiment === 'NEG' ? 'red' : 'gray';
 *
 *   return (
 *     <Badge color={color}>
 *       {sentiment?.sentiment || 'NEUT'}: {sentiment?.sentimentNumber.toFixed(2)}
 *     </Badge>
 *   );
 * }
 * ```
 */
export function useCurrentSentiment(ticker: string) {
  return useQuery({
    queryKey: ['currentSentiment', ticker],
    queryFn: async (): Promise<CombinedWordDetails | null> => {
      console.log(`[useCurrentSentiment] Fetching current sentiment for ${ticker}`);

      // Get all sentiment records and find the most recent
      const allSentiment = await CombinedWordRepository.findByTicker(ticker);

      if (allSentiment.length === 0) {
        console.log(`[useCurrentSentiment] No sentiment found for ${ticker}. Backend analysis required.`);
        return null;
      }

      // Sort by date descending and return the most recent
      const latest = allSentiment.sort((a, b) => b.date.localeCompare(a.date))[0];
      return latest;
    },
    enabled: !!ticker,
  });
}

/**
 * Hook to fetch sentiment for a specific date
 * Useful for historical analysis
 *
 * @param ticker - Stock ticker symbol
 * @param date - Date in YYYY-MM-DD format
 * @returns React Query result with sentiment for specific date
 */
export function useSentimentByDate(ticker: string, date: string) {
  return useQuery({
    queryKey: ['sentimentByDate', ticker, date],
    queryFn: async (): Promise<CombinedWordDetails | null> => {
      console.log(`[useSentimentByDate] Fetching sentiment for ${ticker} on ${date}`);

      const data = await CombinedWordRepository.findByTickerAndDateRange(
        ticker,
        date,
        date
      );

      if (data.length === 0) {
        console.log(`[useSentimentByDate] No sentiment for ${ticker} on ${date}. Backend analysis required.`);
        return null;
      }

      return data[0] || null;
    },
    enabled: !!ticker && !!date,
  });
}

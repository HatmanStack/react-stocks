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
import { syncSentimentData, updatePredictions } from '@/services/sync/sentimentDataSync';
import { getSentimentResults, getArticleSentiment, type DailySentiment } from '@/services/api/lambdaSentiment.service';
import { Environment } from '@/config/environment';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import type { WordCountDetails, CombinedWordDetails, EventType } from '@/types/database.types';
import { getStockPredictions, parsePredictionResponse } from '@/ml/prediction/prediction.service';

/** Process items in batches with concurrency limit */
async function processBatched<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 5
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));
    results.push(...batchResults);
  }
  return results;
}

interface Predictions {
    nextDay: { direction: 'up' | 'down'; probability: number };
    twoWeek: { direction: 'up' | 'down'; probability: number };
    oneMonth: { direction: 'up' | 'down'; probability: number };
}

/** Minimum data points needed for predictions (29 days for CV + horizon) */
const MIN_PREDICTION_DATA = 29;

/**
 * Generate predictions using browser-based logistic regression
 * @param ticker - Stock ticker symbol
 * @param sentimentData - Combined sentiment data
 * @returns Predictions or null if insufficient data
 */
async function generateBrowserPredictions(
  ticker: string,
  sentimentData: CombinedWordDetails[]
): Promise<Predictions | null> {
  console.log(`[Predictions] === Starting prediction generation for ${ticker} ===`);
  console.log(`[Predictions] Sentiment data length: ${sentimentData.length}`);

  try {
    // Step 1: Validate sentiment data length
    if (sentimentData.length < MIN_PREDICTION_DATA) {
      console.log(`[Predictions] FAIL: Insufficient sentiment data for ${ticker}: ${sentimentData.length} days (need ${MIN_PREDICTION_DATA})`);
      return null;
    }

    // Get stock price data from local SQLite
    const stockData = await StockRepository.findByTicker(ticker);
    console.log(`[Predictions] Stock data length: ${stockData.length}`);

    if (stockData.length < MIN_PREDICTION_DATA) {
      console.log(`[Predictions] FAIL: Insufficient stock data for ${ticker}: ${stockData.length} days (need ${MIN_PREDICTION_DATA})`);
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

    // Find dates present in BOTH datasets within the overlap range
    // This ensures 1:1 alignment (handles trading days vs calendar days mismatch)
    const commonDates = [...stockByDate.keys()]
      .filter(d => d >= overlapStart && d <= overlapEnd && sentimentByDate.has(d))
      .sort();

    const trimmedStocks = commonDates.map(d => stockByDate.get(d)!);
    const trimmedSentiment = commonDates.map(d => sentimentByDate.get(d)!);

    // Log alignment stats
    const stockDaysInRange = sortedStocks.filter(s => s.date >= overlapStart && s.date <= overlapEnd).length;
    const sentimentDaysInRange = sortedSentiment.filter(s => s.date >= overlapStart && s.date <= overlapEnd).length;
    const alignmentLoss = Math.max(stockDaysInRange, sentimentDaysInRange) - commonDates.length;
    const alignmentLossPercent = ((alignmentLoss / Math.max(stockDaysInRange, sentimentDaysInRange)) * 100).toFixed(1);

    console.log(`[Predictions] After alignment: ${commonDates.length} common dates (lost ${alignmentLoss} days, ${alignmentLossPercent}%)`);

    // TODO: If alignment loss > 5%, consider interpolation instead of dropping days
    if (parseFloat(alignmentLossPercent) > 5) {
      console.warn(`[Predictions] WARNING: High alignment loss (${alignmentLossPercent}%) - consider revisiting data interpolation strategy`);
    }

    // Step 4: Re-check that trimmed arrays meet minimum requirement
    if (trimmedStocks.length < MIN_PREDICTION_DATA) {
      console.log(`[Predictions] FAIL: After alignment, insufficient stock data: ${trimmedStocks.length} days (need ${MIN_PREDICTION_DATA})`);
      return null;
    }

    if (trimmedSentiment.length < MIN_PREDICTION_DATA) {
      console.log(`[Predictions] FAIL: After alignment, insufficient sentiment data: ${trimmedSentiment.length} days (need ${MIN_PREDICTION_DATA})`);
      return null;
    }

    // Extract features from trimmed, aligned data
    const closePrices = trimmedStocks.map(s => s.close);
    const volumes = trimmedStocks.map(s => s.volume);

    // Extract three-signal sentiment data
    const eventTypes: EventType[] = [];
    const aspectScores: number[] = [];
    const mlScores: number[] = [];

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
    }

    console.log(`[Predictions] Feature extraction complete:`);
    console.log(`[Predictions]   - closePrices: ${closePrices.length} points, range: [${Math.min(...closePrices).toFixed(2)}, ${Math.max(...closePrices).toFixed(2)}]`);
    console.log(`[Predictions]   - volumes: ${volumes.length} points`);
    console.log(`[Predictions]   - eventTypes: ${eventTypes.length} (unique: ${[...new Set(eventTypes)].join(', ')})`);
    console.log(`[Predictions]   - aspectScores: ${aspectScores.length} (non-zero: ${aspectScores.filter(s => s !== 0).length})`);
    console.log(`[Predictions]   - mlScores: ${mlScores.length} (non-zero: ${mlScores.filter(s => s !== 0).length})`);

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
      mlScores
    );
    console.log(`[Predictions] Raw response:`, response);

    const parsed = parsePredictionResponse(response);
    console.log(`[Predictions] Parsed response:`, parsed);

    // Convert to Predictions format with direction and probability
    // The model outputs 0 (up) or 1 (down), we convert to probability
    const toPrediction = (value: number): { direction: 'up' | 'down'; probability: number } => {
      // Value is 0.0-1.0 where 0 = up, 1 = down
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
    };

    // Add Phase 2 prediction fields if this is the latest record and predictions exist
    if (isLatest && predictions) {
        record.nextDayDirection = predictions.nextDay.direction;
        record.nextDayProbability = predictions.nextDay.probability;
        record.twoWeekDirection = predictions.twoWeek.direction;
        record.twoWeekProbability = predictions.twoWeek.probability;
        record.oneMonthDirection = predictions.oneMonth.direction;
        record.oneMonthProbability = predictions.oneMonth.probability;
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

      // Check data quality - must have sentiment scores populated
      const hasQualityData = localData.length >= 10 &&
        localData.some(item => item.sentimentNumber !== undefined || item.avgMlScore !== undefined);

      if (hasQualityData) {
        console.log(`[useSentimentData] Using ${localData.length} local records for ${ticker}`);
        sentimentData = localData;
      }
      // STEP 2: Fall back to backend API if local data insufficient
      else if (Environment.USE_LAMBDA_SENTIMENT) {
        try {
          console.log(`[useSentimentData] Local data insufficient (${localData.length}), fetching from backend`);
          const lambdaResults = await getSentimentResults(ticker, startDate, endDate);

          if (lambdaResults.dailySentiment.length > 0) {
            console.log(`[useSentimentData] Backend returned ${lambdaResults.dailySentiment.length} records`);

            // Transform backend format to local format (without predictions - we generate those locally)
            sentimentData = transformLambdaToLocal(lambdaResults.dailySentiment, ticker);

            // Hydrate local DB for offline access (async, don't block)
            Promise.all(sentimentData.map(record => CombinedWordRepository.upsert(record)))
              .then(() => console.log(`[useSentimentData] Hydrated local DB`))
              .catch(err => console.warn('[useSentimentData] Failed to hydrate local DB:', err));
          }
        } catch (error) {
          console.warn('[useSentimentData] Backend unavailable:', error);
          // Use whatever local data we have
          sentimentData = localData;
        }
      } else {
        // No backend configured, use local data
        sentimentData = localData;
      }

      // STEP 3: If still no data, trigger local sentiment analysis as last resort
      if (sentimentData.length === 0) {
        console.log(`[useSentimentData] No data found, triggering local analysis for ${ticker}`);
        const dates = [];
        for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
          dates.push(formatDateForDB(d));
        }
        await processBatched(dates, (date) => syncSentimentData(ticker, date), 5);
        sentimentData = await CombinedWordRepository.findByTickerAndDateRange(ticker, startDate, endDate);
      }

      // STEP 4: Generate predictions using browser-based logistic regression
      // Only if we have sentiment data and the latest record doesn't have predictions
      console.log(`[useSentimentData] STEP 4: Checking if predictions needed...`);
      console.log(`[useSentimentData]   - sentimentData.length: ${sentimentData.length}`);

      // Find latest record without mutating sentimentData array
      const latestRecord = sentimentData.length > 0
        ? sentimentData.reduce((latest, current) =>
            current.date > latest.date ? current : latest
          )
        : null;

      console.log(`[useSentimentData]   - latestRecord date: ${latestRecord?.date || 'none'}`);
      console.log(`[useSentimentData]   - latestRecord.nextDayDirection: ${latestRecord?.nextDayDirection || 'undefined'}`);

      const needsPredictions = latestRecord && !latestRecord.nextDayDirection;
      console.log(`[useSentimentData]   - needsPredictions: ${needsPredictions}`);

      if (needsPredictions && sentimentData.length > 0) {
        console.log(`[useSentimentData] GENERATING browser-based predictions for ${ticker}`);
        const predictions = await generateBrowserPredictions(ticker, sentimentData);

        if (predictions && latestRecord) {
          console.log(`[useSentimentData] Predictions received:`, predictions);
          // Update latest record with predictions
          latestRecord.nextDayDirection = predictions.nextDay.direction;
          latestRecord.nextDayProbability = predictions.nextDay.probability;
          latestRecord.twoWeekDirection = predictions.twoWeek.direction;
          latestRecord.twoWeekProbability = predictions.twoWeek.probability;
          latestRecord.oneMonthDirection = predictions.oneMonth.direction;
          latestRecord.oneMonthProbability = predictions.oneMonth.probability;
          latestRecord.updateDate = formatDateForDB(new Date());
          console.log(`[useSentimentData] Updated latestRecord with predictions:`, {
            nextDayDirection: latestRecord.nextDayDirection,
            nextDayProbability: latestRecord.nextDayProbability,
            twoWeekDirection: latestRecord.twoWeekDirection,
            oneMonthDirection: latestRecord.oneMonthDirection,
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

      // Check data quality - must have publisher/date/url fields populated
      const hasQualityData = localData.length >= 5 &&
        localData.some(item => item.publisher && item.url);

      if (hasQualityData) {
        console.log(`[useArticleSentiment] Using ${localData.length} local articles for ${ticker}`);
        return localData;
      }

      // STEP 2: Fall back to backend API if local data insufficient
      if (Environment.USE_LAMBDA_SENTIMENT) {
        try {
          console.log(`[useArticleSentiment] Local data insufficient (${localData.length}), fetching from backend`);
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
            }));

            // Hydrate local DB for offline access (async, don't block)
            Promise.all(
              transformed.map(async (record) => {
                const exists = await WordCountRepository.existsByHash(record.hash);
                if (!exists) {
                  await WordCountRepository.insert(record);
                }
              })
            )
              .then(() => console.log(`[useArticleSentiment] Hydrated local DB`))
              .catch((err) => console.warn('[useArticleSentiment] Failed to hydrate local DB:', err));

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
        // No sentiment exists, trigger analysis for today
        const today = formatDateForDB(new Date());
        console.log(`[useCurrentSentiment] No sentiment found, analyzing today (${today})`);
        await syncSentimentData(ticker, today);

        const newSentiment = await CombinedWordRepository.findByTicker(ticker);
        return newSentiment.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
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

      // If no sentiment, trigger analysis for this date
      if (data.length === 0) {
        await syncSentimentData(ticker, date);
        const newData = await CombinedWordRepository.findByTickerAndDateRange(
          ticker,
          date,
          date
        );
        return newData[0] || null;
      }

      return data[0] || null;
    },
    enabled: !!ticker && !!date,
  });
}

/**
 * React Query Hooks for Sentiment Analysis Data
 * Fetches word count and aggregated sentiment data
 */

import { useQuery } from '@tanstack/react-query';
import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import { syncSentimentData, updatePredictions } from '@/services/sync/sentimentDataSync';
import { getSentimentResults, getArticleSentiment, type DailySentiment } from '@/services/api/lambdaSentiment.service';
import { Environment } from '@/config/environment';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import type { WordCountDetails, CombinedWordDetails } from '@/types/database.types';

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

      // Always fetch from Lambda first to get the authoritative data
      if (Environment.USE_LAMBDA_SENTIMENT) {
        try {
          console.log(`[useSentimentData] Fetching from Lambda for ${ticker}`);
          const lambdaResults = await getSentimentResults(ticker, startDate, endDate);

          if (lambdaResults.dailySentiment.length > 0) {
            console.log(`[useSentimentData] Lambda returned ${lambdaResults.dailySentiment.length} records`);

            // Transform Lambda format to local DB format
            const transformed = transformLambdaToLocal(
                lambdaResults.dailySentiment,
                ticker,
                lambdaResults.predictions
            );

            // Hydrate local DB for offline access (async, don't block)
            Promise.all(transformed.map(record => CombinedWordRepository.upsert(record)))
              .then(() => console.log(`[useSentimentData] Hydrated local DB`))
              .catch(err => console.warn('[useSentimentData] Failed to hydrate local DB:', err));

            // Update predictions if available
            if (lambdaResults.predictions) {
                updatePredictions(ticker, lambdaResults.predictions)
                  .catch(err => console.warn('[useSentimentData] Failed to update predictions:', err));
            }

            return transformed;
          }
        } catch (error) {
          console.warn('[useSentimentData] Lambda unavailable, falling back to local:', error);
        }
      }

      // Fallback: Check local DB
      const localData = await CombinedWordRepository.findByTickerAndDateRange(
        ticker,
        startDate,
        endDate
      );

      if (localData.length > 0) {
        console.log(`[useSentimentData] Returning ${localData.length} local records for ${ticker}`);
        return localData;
      }

      // Last resort: Trigger local sentiment analysis
      console.log(`[useSentimentData] No data found, triggering local analysis for ${ticker}`);

      const dates = [];
      for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
        dates.push(formatDateForDB(d));
      }

      // Process dates in batches of 5 to avoid overwhelming the backend
      await processBatched(dates, (date) => syncSentimentData(ticker, date), 5);

      return CombinedWordRepository.findByTickerAndDateRange(ticker, startDate, endDate);
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

      // Fetch from Lambda if enabled
      if (Environment.USE_LAMBDA_SENTIMENT) {
        try {
          console.log(`[useArticleSentiment] Fetching from Lambda for ${ticker}`);
          const lambdaResults = await getArticleSentiment(ticker, startDate, endDate);

          if (lambdaResults.articles.length > 0) {
            console.log(`[useArticleSentiment] Lambda returned ${lambdaResults.articles.length} articles`);

            // Transform Lambda format to local WordCountDetails format
            // Hash from backend is hex string - convert first 13 chars to number for DB compatibility
            // (13 hex chars = 52 bits, within JS safe integer range)
            const transformed: WordCountDetails[] = lambdaResults.articles.map((article, index) => ({
              date: article.date,
              hash: parseInt(article.hash.slice(0, 13), 16) || (Date.now() + index),
              ticker: article.ticker,
              // Article metadata
              title: article.title,
              url: article.url,
              publisher: article.publisher,
              // Bag-of-words sentiment
              positive: article.positive,
              negative: article.negative,
              body: article.body,
              sentiment: article.sentiment,
              sentimentNumber: article.sentimentNumber,
              // Legacy fields
              nextDay: 0,
              twoWks: 0,
              oneMnth: 0,
              // ML fields
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
          console.warn('[useArticleSentiment] Lambda unavailable, falling back to local:', error);
        }
      }

      // Fallback: Check local DB
      const allData = await WordCountRepository.findByTicker(ticker);
      const filteredData = allData.filter(
        (item) => item.date >= startDate && item.date <= endDate
      );

      console.log(`[useArticleSentiment] Returning ${filteredData.length} local records for ${ticker}`);
      return filteredData;
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

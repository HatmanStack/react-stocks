/**
 * React Query Hooks for Sentiment Analysis Data
 * Fetches word count and aggregated sentiment data
 */

import { useQuery } from '@tanstack/react-query';
import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import { syncSentimentData, updatePredictions } from '@/services/sync/sentimentDataSync';
import { getSentimentResults, type DailySentiment } from '@/services/api/lambdaSentiment.service';
import { Environment } from '@/config/environment';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import type { WordCountDetails, CombinedWordDetails } from '@/types/database.types';

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
 * Transform Lambda DailySentiment format to local CombinedWordDetails format
 * Maps three-signal sentiment data (eventCounts, avgAspectScore, avgFinBERTScore)
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

        // Legacy fields (backward compatibility)
        positive: day.positive,
        negative: day.negative,
        sentimentNumber: day.sentimentScore,
        sentiment: day.classification,

        // Legacy numeric predictions (deprecated but required by type)
        nextDay,
        twoWks,
        oneMnth,
        updateDate: formatDateForDB(new Date()),

        // Phase 5: Three-signal sentiment (NEW)
        // Store eventCounts as JSON string for SQLite compatibility
        eventCounts: day.eventCounts ? JSON.stringify(day.eventCounts) : undefined,
        avgAspectScore: day.avgAspectScore ?? null,
        avgFinBERTScore: day.avgFinBERTScore ?? null,
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

      console.log(`[useSentimentData] Fetching sentiment for ${ticker} from ${startDate} to ${endDate}`);

      // Tier 1: Check local DB (fastest, always check first)
      let localData = await CombinedWordRepository.findByTickerAndDateRange(
        ticker,
        startDate,
        endDate
      );

      if (localData.length > 0) {
        console.log(`[useSentimentData] Returning ${localData.length} local records for ${ticker}`);
        return localData;
      }

      // Tier 2: Check Lambda cache (shared across users)
      if (Environment.USE_LAMBDA_SENTIMENT) {
        try {
          console.log(`[useSentimentData] Checking Lambda cache for ${ticker}`);
          const lambdaResults = await getSentimentResults(ticker, startDate, endDate);

          if (lambdaResults.dailySentiment.length > 0) {
            console.log(`[useSentimentData] Lambda cache hit: ${lambdaResults.dailySentiment.length} records`);

            // Transform Lambda format to local DB format
            // Pass predictions if available to be injected into the latest record
            const transformed = transformLambdaToLocal(
                lambdaResults.dailySentiment,
                ticker,
                lambdaResults.predictions
            );

            // Hydrate local DB for offline access
            console.log(`[useSentimentData] Hydrating local DB with Lambda results`);
            for (const record of transformed) {
              await CombinedWordRepository.upsert(record);
            }

            // If predictions exist, also update PortfolioDetails (and ensure persistence)
            if (lambdaResults.predictions) {
                console.log(`[useSentimentData] Updating predictions for ${ticker}`);
                await updatePredictions(ticker, lambdaResults.predictions);
            }

            return transformed;
          }
        } catch (error) {
          console.warn('[useSentimentData] Lambda unavailable, falling back to local analysis:', error);
          // Fall through to local analysis
        }
      }

      // Tier 3: Fallback to local analysis (offline mode or Lambda unavailable)
      console.log(`[useSentimentData] No cached data, triggering local sentiment analysis for ${ticker}`);

      // Sync sentiment for each day in range
      const dates = [];
      for (let d = new Date(startDate); d <= new Date(endDate); d.setDate(d.getDate() + 1)) {
        dates.push(formatDateForDB(d));
      }

      for (const date of dates) {
        await syncSentimentData(ticker, date);
      }

      // Fetch again after local analysis
      localData = await CombinedWordRepository.findByTickerAndDateRange(
        ticker,
        startDate,
        endDate
      );

      console.log(`[useSentimentData] Retrieved ${localData.length} sentiment records after local analysis`);
      return localData;
    },
    enabled: enabled && !!ticker,
    staleTime,
    refetchOnMount: 'always', // Always refetch when component mounts
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
      console.log(`[useArticleSentiment] Fetching article sentiment for ${ticker}`);

      // WordCountRepository only has findByTicker() which returns all records
      // We'll fetch all and filter client-side for the date range
      const allData = await WordCountRepository.findByTicker(ticker);

      // Filter by date range
      const endDate = formatDateForDB(new Date());
      const startDate = formatDateForDB(subDays(new Date(), days));

      const filteredData = allData.filter(
        (item) => item.date >= startDate && item.date <= endDate
      );

      return filteredData;
    },
    enabled: enabled && !!ticker,
    staleTime,
    refetchOnMount: 'always', // Always refetch when component mounts
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

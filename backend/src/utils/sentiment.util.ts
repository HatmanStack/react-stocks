/**
 * Sentiment Utility Functions
 *
 * Shared utilities for sentiment classification and aggregation.
 * Implements multi-signal aggregation (event counts, aspect scores, DistilFinBERT scores).
 * Used across handlers and services for consistency.
 */

import type { SentimentCacheItem, NewsCacheItem } from '../repositories/index.js';
import type { DailySentiment } from '../types/sentiment.types.js';
import type { EventType } from '../types/event.types.js';

/**
 * Classification thresholds for sentiment scores
 * These must stay in sync with article-level classification in analyzer.ts
 */
export const SENTIMENT_THRESHOLDS = {
  POSITIVE: 0.1,  // Scores > 0.1 are positive
  NEGATIVE: -0.1, // Scores < -0.1 are negative
  // Scores between -0.1 and 0.1 are neutral
} as const;

// Re-export DailySentiment type for backward compatibility
export type { DailySentiment } from '../types/sentiment.types.js';

/**
 * Classify sentiment score based on thresholds
 *
 * @param sentimentScore - Score from -1 to 1
 * @returns Classification as POS, NEG, or NEUT
 */
export function classifySentiment(sentimentScore: number): 'POS' | 'NEG' | 'NEUT' {
  if (sentimentScore > SENTIMENT_THRESHOLDS.POSITIVE) {
    return 'POS';
  } else if (sentimentScore < SENTIMENT_THRESHOLDS.NEGATIVE) {
    return 'NEG';
  } else {
    return 'NEUT';
  }
}

/**
 * Aggregate article-level sentiment into daily aggregates with multi-signal metrics
 *
 * Groups sentiments by date and calculates:
 * - Legacy: Total positive/negative counts, sentiment score
 * - NEW (Phase 4): Event distribution, average aspect scores, average DistilFinBERT scores
 *
 * @param sentiments - Article-level sentiment cache items
 * @param articles - News articles with dates
 * @returns Array of daily sentiment aggregates, sorted by date
 *
 * @example
 * ```typescript
 * const daily = aggregateDailySentiment(sentiments, articles);
 * // daily[0] = {
 * //   date: '2025-01-15',
 * //   positive: 15, negative: 3,
 * //   sentimentScore: 0.55,
 * //   eventCounts: { EARNINGS: 2, M&A: 0, ... },
 * //   avgAspectScore: 0.32,
 * //   avgFinBERTScore: 0.68,
 * //   materialEventCount: 4
 * // }
 * ```
 */
export function aggregateDailySentiment(
  sentiments: SentimentCacheItem[],
  articles: NewsCacheItem[]
): DailySentiment[] {
  // Create map of articleHash -> article date
  const articleDateMap = new Map<string, string>();
  for (const article of articles) {
    articleDateMap.set(article.articleHash, article.article.date);
  }

  // Group sentiments by date
  const dailyGroups = new Map<string, SentimentCacheItem[]>();

  for (const sentiment of sentiments) {
    const date = articleDateMap.get(sentiment.articleHash);
    if (!date) continue; // Skip if article not found

    if (!dailyGroups.has(date)) {
      dailyGroups.set(date, []);
    }
    dailyGroups.get(date)!.push(sentiment);
  }

  // Aggregate each day's sentiments
  const dailySentiments: DailySentiment[] = [];

  for (const [date, daySentiments] of dailyGroups.entries()) {
    // Legacy sentiment aggregation (backward compatibility)
    const totalPositive = daySentiments.reduce((sum, s) => sum + s.sentiment.positive, 0);
    const totalNegative = daySentiments.reduce((sum, s) => sum + s.sentiment.negative, 0);

    // Calculate aggregate sentiment score
    const totalSentences = totalPositive + totalNegative;
    const sentimentScore =
      totalSentences > 0 ? (totalPositive - totalNegative) / totalSentences : 0;

    // NEW (Phase 4): Count event types
    const eventCounts: Record<EventType, number> = {
      EARNINGS: 0,
      'M&A': 0,
      GUIDANCE: 0,
      ANALYST_RATING: 0,
      PRODUCT_LAUNCH: 0,
      GENERAL: 0,
    };

    for (const sentiment of daySentiments) {
      const eventType = sentiment.eventType ?? 'GENERAL';
      eventCounts[eventType as EventType] = (eventCounts[eventType as EventType] || 0) + 1;
    }

    // NEW (Phase 4): Average aspect scores (exclude 0 scores which indicate no aspects detected)
    const aspectScores = daySentiments
      .map((s) => s.aspectScore)
      .filter((score): score is number => score !== undefined && score !== 0);
    const avgAspectScore =
      aspectScores.length > 0
        ? aspectScores.reduce((sum, score) => sum + score, 0) / aspectScores.length
        : undefined;

    // NEW (Phase 4): Average DistilFinBERT scores (only for material events)
    const finBERTScores = daySentiments
      .map((s) => s.distilFinBERTScore)
      .filter((score): score is number => score !== undefined);
    const avgFinBERTScore =
      finBERTScores.length > 0
        ? finBERTScores.reduce((sum, score) => sum + score, 0) / finBERTScores.length
        : undefined;
    const materialEventCount = finBERTScores.length;

    dailySentiments.push({
      date,
      // Legacy fields
      positiveCount: totalPositive,
      negativeCount: totalNegative,
      sentimentScore,
      // NEW: Multi-signal fields
      eventCounts,
      avgAspectScore,
      avgFinBERTScore,
      materialEventCount,
    });
  }

  // Sort by date
  return dailySentiments.sort((a, b) => a.date.localeCompare(b.date));
}

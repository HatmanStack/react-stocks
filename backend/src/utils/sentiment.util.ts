/**
 * Sentiment Utility Functions
 *
 * Shared utilities for sentiment classification and aggregation
 * Used across handlers and services for consistency
 */

import type { SentimentCacheItem, NewsCacheItem } from '../repositories/index.js';

/**
 * Classification thresholds for sentiment scores
 * These must stay in sync with article-level classification in analyzer.ts
 */
export const SENTIMENT_THRESHOLDS = {
  POSITIVE: 0.1,  // Scores > 0.1 are positive
  NEGATIVE: -0.1, // Scores < -0.1 are negative
  // Scores between -0.1 and 0.1 are neutral
} as const;

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
 * Aggregate article-level sentiment into daily aggregates
 *
 * Groups sentiments by date and calculates:
 * - Total positive/negative counts per day
 * - Sentiment score: (positive - negative) / total sentences
 * - Classification based on score thresholds
 *
 * @param sentiments - Article-level sentiment cache items
 * @param articles - News articles with dates
 * @returns Array of daily sentiment aggregates, sorted by date
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
    const totalPositive = daySentiments.reduce((sum, s) => sum + s.sentiment.positive, 0);
    const totalNegative = daySentiments.reduce((sum, s) => sum + s.sentiment.negative, 0);
    const totalArticles = daySentiments.length;

    // Calculate aggregate sentiment score
    const totalSentences = totalPositive + totalNegative;
    const sentimentScore =
      totalSentences > 0 ? (totalPositive - totalNegative) / totalSentences : 0;

    // Classify using shared thresholds
    const classification = classifySentiment(sentimentScore);

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

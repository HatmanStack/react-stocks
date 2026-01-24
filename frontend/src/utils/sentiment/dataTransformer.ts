/**
 * Sentiment Data Transformation Utilities
 *
 * Converts between Lambda API format (DailySentiment) and local database format
 * (CombinedWordDetails, WordCountDetails). Pure functions with no side effects.
 */

import { formatDateForDB } from '@/utils/date/dateUtils';
import type { CombinedWordDetails, WordCountDetails } from '@/types/database.types';
import type { DailySentiment } from '@/services/api/lambdaSentiment.service';

export interface Predictions {
  nextDay: { direction: 'up' | 'down'; probability: number } | null;
  twoWeek: { direction: 'up' | 'down'; probability: number } | null;
  oneMonth: { direction: 'up' | 'down'; probability: number } | null;
}

/**
 * Classify a numeric sentiment score into POS/NEG/NEUT
 * Thresholds: >0.1 = POS, <-0.1 = NEG, else NEUT
 */
export function classifySentiment(score: number): 'POS' | 'NEG' | 'NEUT' {
  if (score > 0.1) return 'POS';
  if (score < -0.1) return 'NEG';
  return 'NEUT';
}

/**
 * Transform Lambda DailySentiment format to local CombinedWordDetails format.
 * Maps three-signal sentiment data (eventCounts, avgAspectScore, avgMlScore).
 *
 * If predictions are provided, they are attached to the latest record.
 */
export function transformLambdaToLocal(
  dailySentiment: DailySentiment[],
  ticker: string,
  predictions?: Predictions
): CombinedWordDetails[] {
  const sorted = [...dailySentiment].sort((a, b) => a.date.localeCompare(b.date));
  const latestDate = sorted.length > 0 ? sorted[sorted.length - 1].date : '';

  return sorted.map((day) => {
    const isLatest = day.date === latestDate;

    const record: CombinedWordDetails = {
      date: day.date,
      ticker,
      positive: day.positiveCount,
      negative: day.negativeCount,
      sentimentNumber: day.sentimentScore,
      sentiment: classifySentiment(day.sentimentScore),
      nextDay: 0,
      twoWks: 0,
      oneMnth: 0,
      updateDate: formatDateForDB(new Date()),
      eventCounts: day.eventCounts ? JSON.stringify(day.eventCounts) : undefined,
      avgAspectScore: day.avgAspectScore ?? null,
      avgMlScore: day.avgMlScore ?? null,
      materialEventCount: day.materialEventCount ?? 0,
      avgSignalScore: day.avgSignalScore ?? null,
    };

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
 * Transform Lambda article response to local WordCountDetails format.
 */
export function transformArticleToLocal(
  article: {
    date: string;
    hash: string;
    ticker: string;
    title?: string;
    url?: string;
    publisher?: string;
    positive: number;
    negative: number;
    body?: string;
    sentiment: string;
    sentimentNumber: number;
    eventType?: string;
    aspectScore?: number;
    mlScore?: number;
    signalScore?: number;
  },
  index: number
): WordCountDetails {
  return {
    date: article.date,
    hash: parseInt(article.hash.slice(0, 12), 16) || (Date.now() + index),
    ticker: article.ticker,
    title: article.title,
    url: article.url,
    publisher: article.publisher,
    positive: article.positive,
    negative: article.negative,
    body: article.body ?? '',
    sentiment: article.sentiment,
    sentimentNumber: article.sentimentNumber,
    nextDay: 0,
    twoWks: 0,
    oneMnth: 0,
    eventType: article.eventType as WordCountDetails['eventType'],
    aspectScore: article.aspectScore,
    mlScore: article.mlScore,
    signalScore: article.signalScore,
  };
}

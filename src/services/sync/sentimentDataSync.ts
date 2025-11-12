/**
 * Sentiment Data Synchronization Service
 * Analyzes news articles for sentiment using browser-based ML and stores word counts in database
 */

import * as NewsRepository from '@/database/repositories/news.repository';
import * as WordCountRepository from '@/database/repositories/wordCount.repository';
import * as CombinedWordRepository from '@/database/repositories/combinedWord.repository';
import { analyzeSentiment } from '@/ml/sentiment/sentiment.service';
import { countSentimentWords } from '@/utils/sentiment/wordCounter';
import { calculateSentiment, calculateSentimentScore } from '@/utils/sentiment/sentimentCalculator';
import { generateArticleHash } from '@/services/api/polygon.service';
import { FeatureFlags } from '@/config/features';
import type { WordCountDetails, CombinedWordDetails } from '@/types/database.types';

/**
 * Convert hex hash string to 32-bit integer
 * @param hashString - Hex hash string from generateArticleHash
 * @returns 32-bit integer hash
 */
function hashStringToNumber(hashString: string): number {
  // Take first 8 characters of hex hash and convert to integer
  const hexSubstring = hashString.substring(0, 8);
  return parseInt(hexSubstring, 16);
}

/**
 * Sync sentiment analysis for articles on a specific date
 * @param ticker - Stock ticker symbol
 * @param date - Date to analyze (YYYY-MM-DD)
 * @returns Number of articles analyzed
 */
export async function syncSentimentData(
  ticker: string,
  date: string
): Promise<number> {
  try {
    console.log(`[SentimentDataSync] Analyzing sentiment for ${ticker} on ${date}`);

    // Get all news articles for this ticker and date
    const articles = await NewsRepository.findByTickerAndDateRange(ticker, date, date);

    if (articles.length === 0) {
      console.warn(`[SentimentDataSync] No articles found for ${ticker} on ${date}`);
      return 0;
    }

    console.log(`[SentimentDataSync] Found ${articles.length} articles to analyze`);

    let analyzedCount = 0;
    const wordCounts: { positive: number; negative: number }[] = [];

    // Analyze each article
    for (const article of articles) {
      // Generate hash for deduplication
      const hashString = generateArticleHash(article.articleUrl);
      const hash = hashStringToNumber(hashString);

      // Check if sentiment already exists
      const exists = await WordCountRepository.existsByHash(hash);

      if (exists) {
        console.log(`[SentimentDataSync] Sentiment already exists for hash ${hash}, skipping`);
        continue;
      }

      // Use article description for sentiment analysis
      const text = article.articleDescription || '';

      if (!text || text.length < 10) {
        console.warn(`[SentimentDataSync] Article has no description, skipping`);
        continue;
      }

      let counts: { positive: number; negative: number };

      // Use ML sentiment or fallback based on feature flag
      if (FeatureFlags.USE_BROWSER_SENTIMENT) {
        // New: Browser-based ML sentiment analysis
        const startTime = performance.now();
        const sentimentResult = await analyzeSentiment(text, hashString);
        const duration = performance.now() - startTime;

        // Extract counts from ML service result
        const posCount = parseInt(sentimentResult.positive[0]);
        const negCount = parseInt(sentimentResult.negative[0]);
        const neutCount = parseInt(sentimentResult.neutral[0]);

        counts = {
          positive: posCount,
          negative: negCount,
        };

        console.log(
          `[SentimentDataSync] ML analysis completed in ${duration.toFixed(2)}ms: ` +
            `POS=${posCount}, NEG=${negCount}, NEUT=${neutCount}`
        );
      } else {
        // Old: Simple word counting approach
        counts = countSentimentWords(text);

        console.log(
          `[SentimentDataSync] Word counting completed: ` +
            `POS=${counts.positive}, NEG=${counts.negative}`
        );
      }

      wordCounts.push(counts);

      // Calculate sentiment label and score
      const sentiment = calculateSentiment(counts.positive, counts.negative);
      const sentimentScore = calculateSentimentScore(counts.positive, counts.negative);

      // Create WordCountDetails record
      const wordCountDetails: WordCountDetails = {
        ticker,
        date: article.articleDate,
        positive: counts.positive,
        negative: counts.negative,
        sentiment,
        sentimentNumber: sentimentScore,
        hash,
        body: text,
        nextDay: 0, // Will be filled in later when stock price data is available
        twoWks: 0,
        oneMnth: 0,
      };

      await WordCountRepository.insert(wordCountDetails);
      analyzedCount++;
    }

    console.log(`[SentimentDataSync] Analyzed ${analyzedCount} articles for ${ticker} on ${date}`);

    // Aggregate into CombinedWordDetails
    if (wordCounts.length > 0) {
      await aggregateSentiment(ticker, date, wordCounts);
    }

    return analyzedCount;
  } catch (error) {
    console.error(`[SentimentDataSync] Error syncing sentiment for ${ticker}:`, error);
    throw new Error(`Failed to sync sentiment for ${ticker}: ${error}`);
  }
}

/**
 * Aggregate daily sentiment into CombinedWordDetails
 * @param ticker - Stock ticker symbol
 * @param date - Date (YYYY-MM-DD)
 * @param wordCounts - Array of word counts from all articles
 */
async function aggregateSentiment(
  ticker: string,
  date: string,
  wordCounts: { positive: number; negative: number }[]
): Promise<void> {
  // Sum all positive and negative counts
  const totalPositive = wordCounts.reduce((sum, c) => sum + c.positive, 0);
  const totalNegative = wordCounts.reduce((sum, c) => sum + c.negative, 0);

  // Calculate average sentiment score
  const avgScore = calculateSentimentScore(totalPositive, totalNegative);

  // Determine dominant sentiment
  const dominantSentiment = calculateSentiment(totalPositive, totalNegative);

  // Create CombinedWordDetails record
  const combinedDetails: CombinedWordDetails = {
    ticker,
    date,
    positive: totalPositive,
    negative: totalNegative,
    sentimentNumber: avgScore,
    sentiment: dominantSentiment,
    nextDay: 0,
    twoWks: 0,
    oneMnth: 0,
    updateDate: new Date().toISOString(),
  };

  // Upsert (insert or update)
  await CombinedWordRepository.upsert(combinedDetails);

  console.log(
    `[SentimentDataSync] Aggregated sentiment for ${ticker} on ${date}: ${dominantSentiment} (score: ${avgScore.toFixed(2)})`
  );
}

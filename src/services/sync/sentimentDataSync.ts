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
import { generateArticleHash } from '@/services/api/finnhub.service';
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
    // Get all news articles for this ticker and date
    const articles = await NewsRepository.findByTickerAndDateRange(ticker, date, date);

    if (articles.length === 0) {
      return 0; // Silent - no articles is normal for many dates
    }

    let analyzedCount = 0;
    const wordCounts: { positive: number; negative: number }[] = [];

    // Prepare batch of articles to analyze
    const articlesToAnalyze = [];

    for (const article of articles) {
      const hashString = generateArticleHash(article.articleUrl);
      const hash = hashStringToNumber(hashString);

      // Check if sentiment already exists
      const exists = await WordCountRepository.existsByHash(hash);

      if (exists) {
        continue;
      }

      const text = article.articleDescription || '';

      if (!text || text.length < 10) {
        continue;
      }

      articlesToAnalyze.push({ article, hash, hashString, text });
    }

    console.log(`[SentimentDataSync] Analyzing ${articlesToAnalyze.length} articles in parallel`);

    // Analyze all articles in parallel
    const analysisPromises = articlesToAnalyze.map(async ({ article, hash, hashString, text }) => {
      let counts: { positive: number; negative: number };

      // Use ML sentiment or fallback based on feature flag
      if (FeatureFlags.USE_BROWSER_SENTIMENT) {
        // Browser-based ML sentiment analysis
        const sentimentResult = await analyzeSentiment(text, hashString);

        // Extract counts from ML service result
        const posCount = parseInt(sentimentResult.positive[0]);
        const negCount = parseInt(sentimentResult.negative[0]);

        counts = {
          positive: posCount,
          negative: negCount,
        };
      } else {
        // Fallback: Simple word counting approach
        counts = countSentimentWords(text);
      }

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

      return { wordCountDetails, counts };
    });

    // Wait for all analyses to complete
    const results = await Promise.all(analysisPromises);

    // Insert all results into database
    for (const { wordCountDetails, counts } of results) {
      await WordCountRepository.insert(wordCountDetails);
      wordCounts.push(counts);
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

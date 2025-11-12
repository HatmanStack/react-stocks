/**
 * Sentiment Service Wrapper
 *
 * Provides a service interface that matches the existing Python API service.
 * This allows drop-in replacement of the Cloud Run sentiment service with
 * the browser-based sentiment analyzer.
 */

import { getSentimentAnalyzer } from './analyzer';
import type { SentimentAnalysisResponse } from '@/types/api.types';

/**
 * Analyze sentiment of article text using browser-based ML
 *
 * This function provides the same interface as the Python FinBERT service,
 * allowing it to be a drop-in replacement in the sync pipeline.
 *
 * @param articleText - Full article text to analyze
 * @param hash - Hash identifier for the article
 * @returns Promise resolving to sentiment analysis result
 */
export async function analyzeSentiment(
  articleText: string,
  hash: string
): Promise<SentimentAnalysisResponse> {
  const startTime = performance.now();

  try {
    // Get the singleton analyzer instance
    const analyzer = getSentimentAnalyzer();

    // Analyze the text (synchronous, but wrapped in async for compatibility)
    const result = analyzer.analyze(articleText, hash);

    const duration = performance.now() - startTime;

    console.log(
      `[ML SentimentService] Analysis complete for hash ${hash} in ${duration.toFixed(2)}ms: ` +
        `POS=${result.positive[0]}, NEG=${result.negative[0]}, NEUT=${result.neutral[0]}`
    );

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;

    console.error(
      `[ML SentimentService] Error analyzing sentiment (${duration.toFixed(2)}ms):`,
      error
    );

    // Wrap in Error for consistent error handling
    throw new Error(
      `Browser sentiment analysis failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Get performance metrics for the last N analyses
 * Useful for monitoring and optimization
 */
class PerformanceTracker {
  private durations: number[] = [];
  private maxSamples: number = 100;

  public record(duration: number): void {
    this.durations.push(duration);
    if (this.durations.length > this.maxSamples) {
      this.durations.shift();
    }
  }

  public getStats(): {
    count: number;
    mean: number;
    median: number;
    p95: number;
    p99: number;
  } {
    if (this.durations.length === 0) {
      return { count: 0, mean: 0, median: 0, p95: 0, p99: 0 };
    }

    const sorted = [...this.durations].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    return {
      count: sorted.length,
      mean: sum / sorted.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  public reset(): void {
    this.durations = [];
  }
}

// Singleton performance tracker
const perfTracker = new PerformanceTracker();

/**
 * Analyze sentiment with performance tracking
 *
 * Same as analyzeSentiment but records performance metrics
 *
 * @param articleText - Full article text to analyze
 * @param hash - Hash identifier for the article
 * @returns Promise resolving to sentiment analysis result
 */
export async function analyzeSentimentWithMetrics(
  articleText: string,
  hash: string
): Promise<SentimentAnalysisResponse> {
  const startTime = performance.now();
  const result = await analyzeSentiment(articleText, hash);
  const duration = performance.now() - startTime;

  perfTracker.record(duration);

  return result;
}

/**
 * Get performance statistics for sentiment analysis
 * @returns Performance metrics
 */
export function getPerformanceStats() {
  return perfTracker.getStats();
}

/**
 * Reset performance tracking
 */
export function resetPerformanceStats() {
  perfTracker.reset();
}

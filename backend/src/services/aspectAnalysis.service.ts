/**
 * Aspect Analysis Service
 *
 * Main service for analyzing financial aspects in news articles.
 * Detects all aspects, scores them individually, and combines using materiality weights.
 *
 * @see docs/plans/Phase-2.md Task 4 for implementation details
 * @see docs/plans/Phase-0.md ADR-003 for methodology
 */

import { detectAspect } from '../ml/aspects/detector';
import {
  AspectType,
  ASPECT_WEIGHTS,
  AspectAnalysisResult,
  AspectBreakdown,
  AspectDetectionResult,
} from '../types/aspect.types';

/**
 * Article input for aspect analysis
 */
export interface NewsArticle {
  ticker: string;
  headline: string;
  summary: string;
}

/**
 * Analyzes all financial aspects in an article and produces weighted overall score.
 *
 * @param article - News article to analyze (headline + summary)
 * @param eventType - Optional event type to filter relevant aspects
 * @returns Aspect analysis result with overall score, breakdown, and confidence
 *
 * @example
 * ```typescript
 * const article = {
 *   ticker: 'AAPL',
 *   headline: 'Apple Beats Earnings, Misses Revenue',
 *   summary: 'Apple reported EPS of $1.30 vs $1.20 expected...'
 * };
 *
 * const result = await analyzeAspects(article);
 * // {
 * //   overallScore: 0.25,
 * //   breakdown: { EARNINGS: 0.7, REVENUE: -0.3 },
 * //   confidence: 0.75,
 * //   detectedAspects: [...]
 * // }
 * ```
 */
export async function analyzeAspects(
  article: NewsArticle
): Promise<AspectAnalysisResult> {
  // Combine headline and summary (weight headline 2x more)
  const headlineText = `${article.headline}. ${article.headline}. `; // Repeat for 2x weight
  const text = headlineText + article.summary;

  // Detect all aspects
  const allAspects: AspectType[] = ['REVENUE', 'EARNINGS', 'GUIDANCE', 'MARGINS', 'GROWTH', 'DEBT'];

  const detectedAspects: AspectDetectionResult[] = [];
  const breakdown: AspectBreakdown = {};

  // Process each aspect
  for (const aspect of allAspects) {
    const results = detectAspect(text, aspect);

    if (results.length > 0) {
      // Use the first (most prominent) detection
      // Could also average multiple detections, but first is usually headline
      const detection = results[0];

      detectedAspects.push({
        aspect: detection.aspect,
        score: detection.score,
        confidence: detection.confidence,
        text: detection.text,
      });

      breakdown[aspect] = detection.score;
    }
  }

  // Handle no aspects detected
  if (detectedAspects.length === 0) {
    console.warn('[AspectAnalysis] No aspects detected in article:', article.headline);
    return {
      overallScore: 0,
      breakdown: {},
      confidence: 0,
      detectedAspects: [],
    };
  }

  // Calculate weighted overall score
  let weightedSum = 0;
  let totalWeight = 0;

  detectedAspects.forEach(detection => {
    const weight = ASPECT_WEIGHTS[detection.aspect];
    weightedSum += detection.score * weight;
    totalWeight += weight;
  });

  // Normalize by total weight of detected aspects
  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  // Calculate overall confidence
  // Average confidence across all detected aspects
  // Boost if multiple aspects detected (more signals = more confidence)
  const avgConfidence =
    detectedAspects.reduce((sum, d) => sum + d.confidence, 0) / detectedAspects.length;

  const multiAspectBoost = detectedAspects.length > 1 ? 1.1 : 1.0;
  const confidence = Math.min(avgConfidence * multiAspectBoost, 1.0);

  return {
    overallScore,
    breakdown,
    confidence,
    detectedAspects,
  };
}

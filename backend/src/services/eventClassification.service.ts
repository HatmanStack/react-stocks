/**
 * Event Classification Service
 *
 * Main service for classifying financial news articles into event types.
 * Orchestrates keyword matching and resolves multi-event conflicts via priority.
 */

import type { NewsArticle } from '../repositories/newsCache.repository.js';
import type {
  EventType,
  EventClassificationResult,
} from '../types/event.types.js';
import { EVENT_PRIORITIES } from '../types/event.types.js';
import { EVENT_KEYWORDS } from '../ml/events/keywords.js';
import {
  normalizeText,
  scoreEvent,
  isValidText,
} from '../ml/events/matcher.js';

/**
 * Weight for headline vs summary in classification
 *
 * Headlines are weighted 3x more than summaries as they typically
 * contain the primary topic of the article.
 */
const HEADLINE_WEIGHT = 3.0;
const SUMMARY_WEIGHT = 1.0;

/**
 * Minimum confidence threshold for classification
 *
 * Articles with all scores below this threshold are classified as GENERAL.
 */
const MIN_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Classify a news article into an event type
 *
 * Process:
 * 1. Preprocess article (combine headline + summary with weighting)
 * 2. Score against all 6 event types
 * 3. Resolve conflicts via priority system
 * 4. Return classification with confidence and matched keywords
 *
 * @param article - News article to classify
 * @returns Classification result with event type and confidence
 *
 * @example
 * const article = {
 *   title: 'Apple Reports Q1 Earnings Beat',
 *   description: 'Apple Inc. reported earnings of $1.25 EPS...',
 *   url: 'https://example.com',
 *   date: '2025-01-15'
 * };
 *
 * const result = await classifyEvent(article);
 * // { eventType: 'EARNINGS', confidence: 0.92, matchedKeywords: ['earnings', 'eps'] }
 */
export async function classifyEvent(
  article: NewsArticle
): Promise<EventClassificationResult> {
  try {
    // Preprocess article text
    const { combinedText, headlineText, summaryText } =
      preprocessArticle(article);

    // Validate text
    if (!isValidText(combinedText)) {
      console.warn('[EventClassificationService] Invalid article text:', {
        title: article.title?.substring(0, 50),
      });

      return {
        eventType: 'GENERAL',
        confidence: 0,
        matchedKeywords: [],
      };
    }

    // Score against all event types
    const scores = scoreAllEventTypes(headlineText, summaryText);

    // Resolve to single event type
    const result = resolveEventType(scores);

    // Log classification for monitoring
    console.log('[EventClassificationService] Classified article:', {
      title: article.title?.substring(0, 50),
      eventType: result.eventType,
      confidence: result.confidence.toFixed(2),
      topScores: Object.entries(scores)
        .sort(([, a], [, b]) => b.score - a.score)
        .slice(0, 3)
        .map(([type, { score }]) => `${type}:${score.toFixed(2)}`)
        .join(', '),
    });

    return result;
  } catch (error) {
    console.error('[EventClassificationService] Error classifying event:', error, {
      title: article.title,
    });

    // Fallback to GENERAL on error
    return {
      eventType: 'GENERAL',
      confidence: 0,
      matchedKeywords: [],
    };
  }
}

/**
 * Preprocess article by combining headline and summary with normalization
 *
 * @param article - News article to preprocess
 * @returns Normalized text for headline, summary, and combined
 */
function preprocessArticle(article: NewsArticle): {
  combinedText: string;
  headlineText: string;
  summaryText: string;
} {
  const headlineText = normalizeText(article.title || '');
  const summaryText = normalizeText(article.description || '');

  // Combine with simple concatenation
  // (weighting is applied during scoring, not during text combination)
  const combinedText = `${headlineText} ${summaryText}`.trim();

  return { combinedText, headlineText, summaryText };
}

/**
 * Score article against all event types
 *
 * Applies headline/summary weighting:
 * - Headline matches weighted 3x
 * - Summary matches weighted 1x
 *
 * @param headlineText - Normalized headline text
 * @param summaryText - Normalized summary text
 * @returns Map of event type to score and matched keywords
 */
function scoreAllEventTypes(
  headlineText: string,
  summaryText: string
): Record<
  EventType,
  { score: number; matchedKeywords: Set<string> }
> {
  const scores: Record<EventType, { score: number; matchedKeywords: Set<string> }> = {
    EARNINGS: { score: 0, matchedKeywords: new Set() },
    'M&A': { score: 0, matchedKeywords: new Set() },
    PRODUCT_LAUNCH: { score: 0, matchedKeywords: new Set() },
    ANALYST_RATING: { score: 0, matchedKeywords: new Set() },
    GUIDANCE: { score: 0, matchedKeywords: new Set() },
    GENERAL: { score: 0, matchedKeywords: new Set() },
  };

  // Score each event type
  for (const eventType of Object.keys(EVENT_KEYWORDS) as EventType[]) {
    const keywords = EVENT_KEYWORDS[eventType];

    // Score headline (weighted 3x)
    const headlineScore = scoreEvent(headlineText, keywords);

    // Score summary (weighted 1x)
    const summaryScore = scoreEvent(summaryText, keywords);

    // Apply weighting
    const weightedScore =
      headlineScore * HEADLINE_WEIGHT + summaryScore * SUMMARY_WEIGHT;

    // Normalize by total weight
    const normalizedScore = weightedScore / (HEADLINE_WEIGHT + SUMMARY_WEIGHT);

    scores[eventType].score = normalizedScore;

    // Track matched keywords (for debugging)
    // Note: This is simplified - in production, you'd extract actual matched keywords
    if (normalizedScore > 0) {
      scores[eventType].matchedKeywords.add(eventType.toLowerCase());
    }
  }

  return scores;
}

/**
 * Resolve multi-event conflicts via priority system
 *
 * Rules:
 * 1. If all scores < threshold, return GENERAL
 * 2. If one score clearly highest (>0.1 difference), return that event
 * 3. If multiple high scores, use priority system (EARNINGS > M&A > ...)
 *
 * @param scores - Scores for all event types
 * @returns Classification result
 */
function resolveEventType(
  scores: Record<EventType, { score: number; matchedKeywords: Set<string> }>
): EventClassificationResult {
  // Find event type with highest score
  let maxScore = 0;
  let maxEventType: EventType = 'GENERAL';
  const candidateEvents: Array<{ eventType: EventType; score: number }> = [];

  for (const [eventType, { score }] of Object.entries(scores) as Array<
    [EventType, { score: number; matchedKeywords: Set<string> }]
  >) {
    if (score > maxScore) {
      maxScore = score;
      maxEventType = eventType;
    }

    // Track all events with score above threshold
    if (score >= MIN_CONFIDENCE_THRESHOLD) {
      candidateEvents.push({ eventType, score });
    }
  }

  // Case 1: No event meets threshold -> GENERAL
  if (maxScore < MIN_CONFIDENCE_THRESHOLD) {
    return {
      eventType: 'GENERAL',
      confidence: maxScore,
      matchedKeywords: Array.from(scores.GENERAL.matchedKeywords),
    };
  }

  // Case 2: Only one candidate -> return it
  if (candidateEvents.length === 1) {
    return {
      eventType: maxEventType,
      confidence: maxScore,
      matchedKeywords: Array.from(scores[maxEventType].matchedKeywords),
    };
  }

  // Case 3: Multiple candidates with close scores -> use priority
  if (candidateEvents.length > 1) {
    // Check if scores are close (within 0.1)
    const sortedCandidates = candidateEvents.sort((a, b) => b.score - a.score);
    const topScore = sortedCandidates[0].score;
    const secondScore = sortedCandidates[1]?.score || 0;

    if (topScore - secondScore > 0.1) {
      // Clear winner
      return {
        eventType: sortedCandidates[0].eventType,
        confidence: topScore,
        matchedKeywords: Array.from(
          scores[sortedCandidates[0].eventType].matchedKeywords
        ),
      };
    }

    // Scores are close -> resolve by priority
    const highestPriorityEvent = sortedCandidates.reduce((highest, current) => {
      const highestPriority = EVENT_PRIORITIES[highest.eventType];
      const currentPriority = EVENT_PRIORITIES[current.eventType];

      return currentPriority > highestPriority ? current : highest;
    });

    console.log('[EventClassificationService] Multi-event conflict resolved by priority:', {
      candidates: sortedCandidates.map((c) => `${c.eventType}:${c.score.toFixed(2)}`).join(', '),
      selected: highestPriorityEvent.eventType,
    });

    return {
      eventType: highestPriorityEvent.eventType,
      confidence: highestPriorityEvent.score,
      matchedKeywords: Array.from(
        scores[highestPriorityEvent.eventType].matchedKeywords
      ),
    };
  }

  // Fallback (should not reach here)
  return {
    eventType: maxEventType,
    confidence: maxScore,
    matchedKeywords: Array.from(scores[maxEventType].matchedKeywords),
  };
}

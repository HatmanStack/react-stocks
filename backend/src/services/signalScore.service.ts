/**
 * Signal Score Service
 *
 * Calculates a "Signal Score" for articles based on cheap metadata signals:
 * - Publisher authority (40%): Source credibility lookup
 * - Headline quality (30%): Specificity and professionalism patterns
 * - Volume context (20%): Article count relative to average
 * - Recency (10%): Freshness factor
 *
 * This provides predictive value from non-material articles without expensive ML inference.
 */

/**
 * Publisher authority scores (0-1)
 * Higher scores indicate more credible/established financial news sources
 */
const PUBLISHER_SCORES: Record<string, number> = {
  // Tier 1: Major financial news (1.0 - 0.9)
  'Reuters': 1.0,
  'Bloomberg': 1.0,
  'Wall Street Journal': 0.95,
  'WSJ': 0.95,
  'Financial Times': 0.95,
  'The Economist': 0.9,
  'Associated Press': 0.9,
  'AP': 0.9,

  // Tier 2: Established business news (0.85 - 0.75)
  'CNBC': 0.85,
  'MarketWatch': 0.8,
  "Barron's": 0.8,
  "Investor's Business Daily": 0.8,
  'IBD': 0.8,
  'Forbes': 0.75,
  'Fortune': 0.75,

  // Tier 3: General financial coverage (0.7 - 0.6)
  'Yahoo Finance': 0.7,
  'Yahoo': 0.7,
  'Business Insider': 0.65,
  'TheStreet': 0.65,
  'Motley Fool': 0.6,
  'The Motley Fool': 0.6,
  'Kiplinger': 0.6,

  // Tier 4: Aggregators/User content (0.5 - 0.4)
  'Seeking Alpha': 0.5,
  'Benzinga': 0.5,
  'Zacks': 0.5,
  'Zacks Investment Research': 0.5,
  'PR Newswire': 0.45,
  'Business Wire': 0.45,
  'GlobeNewswire': 0.45,
  'Accesswire': 0.4,
};

const DEFAULT_PUBLISHER_SCORE = 0.4;

/**
 * Weights for each signal component
 */
const WEIGHTS = {
  PUBLISHER: 0.4,
  HEADLINE: 0.3,
  VOLUME: 0.2,
  RECENCY: 0.1,
} as const;

/**
 * Article metadata for signal calculation
 */
export interface ArticleMetadata {
  publisher?: string;
  title: string;
  date: string; // YYYY-MM-DD
}

/**
 * Volume context for signal calculation
 */
export interface VolumeContext {
  dailyCount: number;
  averageCount: number; // 7-day rolling average
}

/**
 * Detailed breakdown of signal score components
 */
export interface SignalBreakdown {
  publisher: number;
  headline: number;
  volume: number;
  recency: number;
}

/**
 * Get publisher authority score
 */
export function getPublisherScore(publisher?: string): number {
  if (!publisher) return DEFAULT_PUBLISHER_SCORE;

  // Try exact match first
  if (PUBLISHER_SCORES[publisher] !== undefined) {
    return PUBLISHER_SCORES[publisher];
  }

  // Try case-insensitive match
  const normalized = publisher.toLowerCase();
  for (const [key, score] of Object.entries(PUBLISHER_SCORES)) {
    if (key.toLowerCase() === normalized) {
      return score;
    }
    // Partial match (e.g., "Reuters" in "Reuters News")
    if (normalized.includes(key.toLowerCase())) {
      return score;
    }
  }

  return DEFAULT_PUBLISHER_SCORE;
}

/**
 * Calculate headline quality score based on patterns
 *
 * Positive signals:
 * - Contains specific numbers/percentages (concrete data)
 * - Contains quotes (direct sources)
 * - Moderate length (not too short/clickbaity)
 *
 * Negative signals:
 * - All caps (clickbait)
 * - Ends with question mark (speculative)
 * - Very short (<20 chars) or very long (>150 chars)
 */
export function getHeadlineScore(title: string): number {
  if (!title) return 0.3;

  let score = 0.5; // Base score

  // Positive patterns
  const hasNumbers = /\d+%?/.test(title);
  const hasQuotes = /["'].*["']/.test(title);
  const hasDollarAmount = /\$[\d,.]+[BMK]?/.test(title);

  if (hasNumbers) score += 0.15;
  if (hasQuotes) score += 0.1;
  if (hasDollarAmount) score += 0.15;

  // Negative patterns
  const isQuestion = /\?$/.test(title);
  const isAllCaps = /^[A-Z\s]{15,}$/.test(title);
  const hasExcessiveExclamation = (title.match(/!/g) || []).length > 1;

  if (isQuestion) score -= 0.15;
  if (isAllCaps) score -= 0.2;
  if (hasExcessiveExclamation) score -= 0.15;

  // Length penalty
  const length = title.length;
  if (length < 20) score -= 0.1; // Too short
  if (length > 150) score -= 0.1; // Too long

  // Clamp to valid range
  return Math.max(0, Math.min(1, score));
}

/**
 * Calculate volume context score
 *
 * Higher score when:
 * - Article count is above average (increased attention)
 * - But not excessively high (may indicate noise)
 */
export function getVolumeScore(context: VolumeContext): number {
  const { dailyCount, averageCount } = context;

  if (averageCount <= 0) return 0.5; // No baseline

  const ratio = dailyCount / averageCount;

  // Optimal range: 1.0 - 2.0x average
  if (ratio >= 1.0 && ratio <= 2.0) {
    return 0.7 + (ratio - 1.0) * 0.3; // 0.7 - 1.0
  }

  // Below average: lower score
  if (ratio < 1.0) {
    return 0.3 + ratio * 0.4; // 0.3 - 0.7
  }

  // Way above average (>2x): diminishing returns (noise)
  return Math.max(0.6, 1.0 - (ratio - 2.0) * 0.1);
}

/**
 * Calculate recency score
 *
 * Higher score for more recent articles
 */
export function getRecencyScore(articleDate: string): number {
  const today = new Date();
  const article = new Date(articleDate);
  const daysDiff = Math.floor((today.getTime() - article.getTime()) / (1000 * 60 * 60 * 24));

  if (daysDiff <= 0) return 1.0; // Today
  if (daysDiff === 1) return 0.9; // Yesterday
  if (daysDiff <= 3) return 0.7; // This week
  if (daysDiff <= 7) return 0.5; // Last week
  if (daysDiff <= 14) return 0.3; // 2 weeks
  return 0.2; // Older
}

/**
 * Calculate the overall signal score for an article
 *
 * @param article - Article metadata (publisher, title, date)
 * @param volumeContext - Optional volume context for the day
 * @returns Signal score (0-1) and breakdown
 */
export function calculateSignalScore(
  article: ArticleMetadata,
  volumeContext?: VolumeContext
): { score: number; breakdown: SignalBreakdown } {
  const publisherScore = getPublisherScore(article.publisher);
  const headlineScore = getHeadlineScore(article.title);
  const volumeScore = volumeContext
    ? getVolumeScore(volumeContext)
    : 0.5; // Default if no context
  const recencyScore = getRecencyScore(article.date);

  const breakdown: SignalBreakdown = {
    publisher: publisherScore,
    headline: headlineScore,
    volume: volumeScore,
    recency: recencyScore,
  };

  const score =
    publisherScore * WEIGHTS.PUBLISHER +
    headlineScore * WEIGHTS.HEADLINE +
    volumeScore * WEIGHTS.VOLUME +
    recencyScore * WEIGHTS.RECENCY;

  return {
    score: Math.round(score * 100) / 100, // Round to 2 decimal places
    breakdown,
  };
}

/**
 * Batch calculate signal scores for multiple articles
 * Efficiently computes volume context once for all articles on the same day
 *
 * @param articles - Array of article metadata
 * @param historicalCounts - Map of date -> article count for volume context
 * @returns Map of article index -> signal score
 */
export function calculateSignalScoresBatch(
  articles: ArticleMetadata[],
  historicalCounts?: Map<string, number>
): Map<number, { score: number; breakdown: SignalBreakdown }> {
  const results = new Map<number, { score: number; breakdown: SignalBreakdown }>();

  // Count articles per day for volume context
  const dailyCounts = new Map<string, number>();
  for (const article of articles) {
    dailyCounts.set(article.date, (dailyCounts.get(article.date) || 0) + 1);
  }

  // Calculate 7-day average from historical data or current batch
  const allCounts = historicalCounts
    ? Array.from(historicalCounts.values())
    : Array.from(dailyCounts.values());
  const averageCount = allCounts.length > 0
    ? allCounts.reduce((a, b) => a + b, 0) / allCounts.length
    : 1;

  // Calculate signal score for each article
  articles.forEach((article, index) => {
    const volumeContext: VolumeContext = {
      dailyCount: dailyCounts.get(article.date) || 1,
      averageCount,
    };

    results.set(index, calculateSignalScore(article, volumeContext));
  });

  return results;
}

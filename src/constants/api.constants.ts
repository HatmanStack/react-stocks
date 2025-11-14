/**
 * API Configuration Constants
 * Central configuration for all external API endpoints and timeouts
 */

import { Environment } from '@/config/environment';

/**
 * API Endpoint URLs
 */
export const API_ENDPOINTS = {
  // Backend Lambda (Phase 1 - Active)
  // Proxies stock data (Tiingo) and news (Finnhub) with API keys secured server-side
  BACKEND_API: Environment.BACKEND_URL || '',

  // Python Microservices (Google Cloud Run) - DEPRECATED
  // Note: These are kept for rollback capability during migration
  // Remove after Phase 5 verification is complete
  /** @deprecated Use browser-based sentiment analysis (Phase 2). Fallback only if feature flag disabled. */
  SENTIMENT_ANALYSIS: 'https://stocks-backend-sentiment-f3jmjyxrpq-uc.a.run.app',
  /** @deprecated Use browser-based prediction model (Phase 3). Fallback only if feature flag disabled. */
  STOCK_PREDICTION: 'https://stocks-f3jmjyxrpq-uc.a.run.app',

  // External Stock Data APIs - DEPRECATED
  // Note: Frontend no longer calls these directly (Lambda backend proxies)
  /** @deprecated Direct API calls moved to Lambda backend. Not used in frontend. */
  TIINGO_BASE: 'https://api.tiingo.com',
  /** @deprecated Polygon replaced by Finnhub. Backend uses Finnhub for news. */
  POLYGON_BASE: 'https://api.polygon.io',
} as const;

/**
 * API Timeout Values (in milliseconds)
 */
export const API_TIMEOUTS = {
  // Backend Lambda (handles retries internally)
  BACKEND: 30000, // 30s (Lambda handles Tiingo/Finnhub API retries and pagination)

  // Browser-based ML (local computation, no network timeout needed)
  SENTIMENT: 5000, // 5s (runs in browser, should be fast)
  PREDICTION: 2000, // 2s (runs in browser, should be fast)

  // Legacy timeouts (deprecated, kept for rollback)
  /** @deprecated Use BACKEND timeout */
  TIINGO: 10000, // 10s
  /** @deprecated Use BACKEND timeout */
  POLYGON: 10000, // 10s
} as const;

/**
 * API Rate Limits
 *
 * Note: Rate limits are now handled by Lambda backend for Tiingo/Finnhub.
 * Frontend doesn't need to implement rate limiting for these APIs.
 */
export const API_RATE_LIMITS = {
  /** @deprecated Polygon replaced by Finnhub. Backend handles rate limiting. */
  POLYGON_FREE_TIER: 5, // 5 requests per minute
  /** @deprecated Backend handles Tiingo rate limiting */
  TIINGO_FREE_TIER: 500, // 500 requests per hour
} as const;

/**
 * Migration Status Notes
 *
 * Phase 1 (Complete): Lambda backend deployed with Tiingo/Finnhub proxying (Polygon deprecated)
 * Phase 2 (Complete): Browser-based sentiment analysis implemented
 * Phase 3 (Complete): Browser-based prediction model implemented
 * Phase 4 (In Progress): Frontend services migrated to use backend
 * Phase 5 (Pending): Final verification and Python service decommissioning
 *
 * TODO Phase 5: Remove deprecated constants after migration verification
 */

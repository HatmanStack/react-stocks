/**
 * Repositories Barrel Export
 *
 * All repositories use single-table DynamoDB design.
 * See docs/plans/Phase-0.md ADR-003 for design rationale.
 */

// News Cache Repository
export type { NewsCacheItem, NewsArticle, LegacyNewsCacheItem } from './newsCache.repository.js';
export {
  getArticle,
  putArticle,
  batchPutArticles,
  queryArticlesByTicker,
  existsInCache as newsExistsInCache,
  batchCheckExistence as newsBatchCheckExistence,
} from './newsCache.repository.js';

// Sentiment Cache Repository
export type { SentimentCacheItem, SentimentData } from './sentimentCache.repository.js';
export {
  getSentiment,
  putSentiment,
  batchPutSentiments,
  querySentimentsByTicker,
  existsInCache as sentimentExistsInCache,
  batchCheckExistence as sentimentBatchCheckExistence,
} from './sentimentCache.repository.js';

// Sentiment Jobs Repository
export type { SentimentJob } from './sentimentJobs.repository.js';
export {
  getJob,
  createJob,
  updateJobStatus,
  markJobCompleted,
  markJobFailed,
} from './sentimentJobs.repository.js';

// Daily Sentiment Aggregate Repository
export {
  putDailyAggregate,
  getDailyAggregate,
  getLatestDailyAggregate,
  queryByTickerAndDateRange,
} from './dailySentimentAggregate.repository.js';

// Circuit Breaker Repository
export { getCircuitState, recordSuccess, recordFailure } from './circuitBreaker.repository.js';

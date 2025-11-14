/**
 * Repositories Barrel Export
 *
 * Centralized export point for all repository modules
 */

// Import all repositories as namespaces to avoid naming conflicts
import * as StocksCacheRepository from './stocksCache.repository.js';
import * as NewsCacheRepository from './newsCache.repository.js';
import * as SentimentCacheRepository from './sentimentCache.repository.js';
import * as SentimentJobsRepository from './sentimentJobs.repository.js';

// Re-export as namespaces
export { StocksCacheRepository, NewsCacheRepository, SentimentCacheRepository, SentimentJobsRepository };

// Also export types for convenience
export type {
  StockCacheItem,
  PriceData,
  StockMetadata,
} from './stocksCache.repository.js';

export type {
  NewsCacheItem,
  NewsArticle,
} from './newsCache.repository.js';

export type {
  SentimentCacheItem,
  SentimentData,
} from './sentimentCache.repository.js';

export type {
  SentimentJob,
} from './sentimentJobs.repository.js';

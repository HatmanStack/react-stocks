/**
 * Cache Transform Utilities
 * Shared transformations between API formats and cache formats
 * Used by handlers and cache warming scripts
 */

import type { TiingoStockPrice } from '../types/tiingo.types';
import type { FinnhubNewsArticle } from '../types/finnhub.types';
import type { StockCacheItem } from '../repositories/stocksCache.repository';
import type { NewsCacheItem } from '../repositories/newsCache.repository';
import { generateArticleHash } from './hash.util';

/**
 * Transform Tiingo price data to cache format
 * @param ticker - Stock ticker symbol
 * @param tiingoData - Array of Tiingo stock prices
 * @returns Array of cache items (without TTL - repository adds it)
 */
export function transformTiingoToCache(ticker: string, tiingoData: TiingoStockPrice[]): Omit<StockCacheItem, 'ttl'>[] {
  return tiingoData.map((price) => ({
    ticker,
    date: price.date.split('T')[0], // Extract date from ISO timestamp
    priceData: {
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
      volume: price.volume,
      adjOpen: price.adjOpen,
      adjHigh: price.adjHigh,
      adjLow: price.adjLow,
      adjClose: price.adjClose,
      adjVolume: price.adjVolume,
      divCash: price.divCash,
      splitFactor: price.splitFactor,
    },
    fetchedAt: Date.now(),
  }));
}

/**
 * Transform cached stock data back to Tiingo format for response
 * @param cacheItems - Array of cached stock items
 * @returns Array of Tiingo stock prices
 */
export function transformCacheToTiingo(cacheItems: StockCacheItem[]): TiingoStockPrice[] {
  return cacheItems.map((item) => ({
    date: `${item.date}T00:00:00.000Z`, // Add timestamp for consistency
    open: item.priceData.open,
    high: item.priceData.high,
    low: item.priceData.low,
    close: item.priceData.close,
    volume: item.priceData.volume,
    adjOpen: item.priceData.adjOpen ?? item.priceData.open,
    adjHigh: item.priceData.adjHigh ?? item.priceData.high,
    adjLow: item.priceData.adjLow ?? item.priceData.low,
    adjClose: item.priceData.adjClose ?? item.priceData.close,
    adjVolume: item.priceData.adjVolume ?? item.priceData.volume,
    divCash: item.priceData.divCash ?? 0,
    splitFactor: item.priceData.splitFactor ?? 1,
  }));
}

/**
 * Transform Finnhub article to cache format
 * @param ticker - Stock ticker symbol
 * @param finnhubArticle - Finnhub news article
 * @param precomputedHash - Optional pre-computed hash to avoid recomputation
 * @returns Cache item (without TTL - repository adds it)
 */
export function transformFinnhubToCache(
  ticker: string,
  finnhubArticle: FinnhubNewsArticle,
  precomputedHash?: string
): Omit<NewsCacheItem, 'ttl'> {
  // Convert Unix timestamp to ISO date string
  const date = new Date(finnhubArticle.datetime * 1000).toISOString().split('T')[0];

  return {
    ticker,
    articleHash: precomputedHash ?? generateArticleHash(finnhubArticle.url),
    article: {
      title: finnhubArticle.headline,
      url: finnhubArticle.url,
      description: finnhubArticle.summary,
      date,
      publisher: finnhubArticle.source,
      imageUrl: finnhubArticle.image,
    },
    fetchedAt: Date.now(),
  };
}

/**
 * Transform cached article to Finnhub format for response
 * @param cacheItem - Cached news item
 * @returns Finnhub news article
 */
export function transformCacheToFinnhub(cacheItem: NewsCacheItem): FinnhubNewsArticle {
  // Convert ISO date string back to Unix timestamp (approximate - use noon UTC)
  const datetime = Math.floor(new Date(`${cacheItem.article.date}T12:00:00Z`).getTime() / 1000);

  return {
    category: 'general', // Cached articles don't have category info
    datetime,
    headline: cacheItem.article.title,
    id: 0, // Generated ID not available for cached articles
    image: cacheItem.article.imageUrl || '',
    related: '', // Not stored in cache
    source: cacheItem.article.publisher || '',
    summary: cacheItem.article.description || '',
    url: cacheItem.article.url,
  };
}

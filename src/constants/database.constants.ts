/**
 * Database constants
 * Names, versions, and table identifiers
 */

export const DB_NAME = 'stock_sentiment.db';
export const DB_VERSION = 2; // Phase 5: Added three-signal sentiment columns

export const TABLE_NAMES = {
  STOCK_DETAILS: 'stock_details',
  SYMBOL_DETAILS: 'symbol_details',
  NEWS_DETAILS: 'news_details',
  WORD_COUNT_DETAILS: 'word_count_details',
  COMBINED_WORD_DETAILS: 'combined_word_count_details',
  PORTFOLIO_DETAILS: 'portfolio_details',
} as const;

export type TableName = (typeof TABLE_NAMES)[keyof typeof TABLE_NAMES];

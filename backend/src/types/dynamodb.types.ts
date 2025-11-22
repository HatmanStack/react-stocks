export interface StockHistoricalDataItem {
  ticker: string;
  date: string; // ISO 8601 date (YYYY-MM-DD)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjClose?: number;
  marketCap?: number;
  peRatio?: number;
  pbRatio?: number;
  [key: string]: any; // Allow for future extensibility
}

export interface ArticleAnalysisDataItem {
  ticker: string;
  'articleHash#date': string; // Composite sort key
  articleHash: string;
  date: string;
  eventType?: 'EARNINGS' | 'M&A' | 'GUIDANCE' | 'ANALYST_RATING' | 'PRODUCT_LAUNCH' | 'GENERAL';
  aspectScore?: number;
  distilFinBERTScore?: number;
  materialityScore?: number;
  title?: string;
  articleUrl?: string;
  publisher?: string;
  [key: string]: any;
}

export interface DailySentimentAggregateItem {
  ticker: string;
  date: string;
  eventCounts: Record<string, number>;
  avgAspectScore?: number;
  avgFinBERTScore?: number;
  materialEventCount?: number;
  nextDayDirection?: 'up' | 'down';
  nextDayProbability?: number;
  twoWeekDirection?: 'up' | 'down';
  twoWeekProbability?: number;
  oneMonthDirection?: 'up' | 'down';
  oneMonthProbability?: number;
  [key: string]: any;
}

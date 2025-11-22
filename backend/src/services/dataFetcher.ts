import { DynamoDBClientWrapper } from './dynamodb.client';
import { StockPrice, ArticleSentiment, HistoricalData } from '../types/prediction.types';
import { StockHistoricalDataItem, ArticleAnalysisDataItem } from '../types/dynamodb.types';

const dynamoDB = new DynamoDBClientWrapper();

/**
 * Calculates the start date given a number of days back from today.
 * @param days Number of days to look back.
 * @returns ISO 8601 date string (YYYY-MM-DD).
 */
function calculateStartDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Fetches historical stock price data for a given ticker and date range.
 * @param ticker Stock ticker symbol.
 * @param startDate Start date in ISO 8601 format (YYYY-MM-DD).
 * @param endDate End date in ISO 8601 format (YYYY-MM-DD).
 * @returns List of StockPrice objects.
 */
export async function fetchPriceData(ticker: string, startDate: string, endDate: string): Promise<StockPrice[]> {
  try {
    const items = await dynamoDB.queryStockDataByDateRange(ticker, startDate, endDate);

    return items.map((item: StockHistoricalDataItem) => ({
      date: item.date,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    })).sort((a, b) => a.date.localeCompare(b.date));
  } catch (error) {
    console.error(`[DataFetcher] Error fetching price data for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Fetches analyzed article sentiment data for a given ticker and date range.
 * @param ticker Stock ticker symbol.
 * @param startDate Start date in ISO 8601 format (YYYY-MM-DD).
 * @param endDate End date in ISO 8601 format (YYYY-MM-DD).
 * @returns List of ArticleSentiment objects.
 */
export async function fetchSentimentData(ticker: string, startDate: string, endDate: string): Promise<ArticleSentiment[]> {
  try {
    const items = await dynamoDB.queryArticlesByTicker(ticker, startDate, endDate);

    return items.map((item: ArticleAnalysisDataItem) => ({
      hash: item.articleHash,
      date: item.date,
      eventType: item.eventType || null,
      aspectScore: item.aspectScore !== undefined ? item.aspectScore : null,
      distilFinBERTScore: item.distilFinBERTScore !== undefined ? item.distilFinBERTScore : null,
      materialityScore: item.materialityScore !== undefined ? item.materialityScore : null,
    }));
  } catch (error) {
    console.error(`[DataFetcher] Error fetching sentiment data for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Fetches all necessary historical data for prediction training.
 * @param ticker Stock ticker symbol.
 * @param days Number of days of history to fetch.
 * @returns Aggregate HistoricalData object.
 * @throws Error if insufficient data is available (less than 30 days of price data).
 */
export async function fetchHistoricalData(ticker: string, days: number): Promise<HistoricalData> {
  if (days < 30) {
      throw new Error('Insufficient data requested: Minimum 30 days required.');
  }

  const endDate = new Date().toISOString().split('T')[0];
  const startDate = calculateStartDate(days);

  try {
    const [prices, sentiment] = await Promise.all([
      fetchPriceData(ticker, startDate, endDate),
      fetchSentimentData(ticker, startDate, endDate)
    ]);

    // Validate minimum data requirements
    // Note: We check if we have at least some data, but strictly we might want to check
    // if we have enough distinct days.
    // For now, let's assume if we get prices, we are good, but the caller might need to check count.
    // The plan says "Raise exception if insufficient data (<30 days)".
    // This usually means we check the result length.

    if (prices.length < 30) {
         // In a real scenario, we might fetch from external API if DB is empty.
         // But per plan: "Fetch from Tiingo/Finnhub, store in DynamoDB" happens before or is implied.
         // The prompt says "Backend checks DynamoDB... If missing... Fetch".
         // However, Task 5 says "fetch_price_data... Use boto3 to query DynamoDB".
         // It doesn't explicitly say to implement the fetch-from-api-and-store logic here,
         // but ADR-6 says "Backend checks DynamoDB... If missing... Fetch from Tiingo".
         // This logic might belong in the Orchestrator or here.
         // Given Task 5 description: "This layer provides raw data to the feature engineering pipeline... Use boto3 to query DynamoDB",
         // and "Raise exception if insufficient data", I will stick to querying DB.
         // The population of DB likely happens elsewhere or I should throw if not present.
         // For now, I will throw.
         throw new Error(`Insufficient price data for ${ticker}: Found ${prices.length} days, required 30.`);
    }

    return {
      ticker,
      prices,
      sentiment
    };
  } catch (error) {
    console.error(`[DataFetcher] Error fetching historical data for ${ticker}:`, error);
    throw error;
  }
}

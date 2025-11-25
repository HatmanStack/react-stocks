import { useQuery } from '@tanstack/react-query';
import {
  fetchBatchStocks,
  fetchBatchNews,
  fetchBatchSentiment,
  BatchStocksResponse,
  BatchNewsResponse,
  BatchSentimentResponse
} from '../services/api/batch.service';

// Helper to chunk array into smaller arrays
function chunk<T>(array: T[], size: number): T[][] {
  const chunked: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunked.push(array.slice(i, i + size));
  }
  return chunked;
}

interface PortfolioBatchData {
  stocks: Record<string, any>; // Using any for now as we might need to transform data
  news: Record<string, any>;
  sentiment: Record<string, any>;
  errors: Record<string, string>;
}

interface UsePortfolioBatchDataResult {
  data: PortfolioBatchData | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

const BATCH_SIZE = 10;

export function usePortfolioBatchData(tickers: string[]): UsePortfolioBatchDataResult {
  // Helper to get 30 days ago date string
  const getStartDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return date.toISOString().split('T')[0];
  };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['portfolioBatch', tickers],
    queryFn: async () => {
      if (!tickers.length) {
        return { stocks: {}, news: {}, sentiment: {}, errors: {} };
      }

      const batches = chunk(tickers, BATCH_SIZE);
      const startDate = getStartDate();

      // Process batches in parallel
      const batchResults = await Promise.all(
        batches.map(async (batchTickers) => {
          // Fetch all 3 data types in parallel for this batch
          const [stocksRes, newsRes, sentimentRes] = await Promise.allSettled([
            fetchBatchStocks({ tickers: batchTickers, startDate }),
            fetchBatchNews({ tickers: batchTickers, limit: 10 }),
            fetchBatchSentiment({ tickers: batchTickers, startDate })
          ]);

          return {
            stocks: stocksRes.status === 'fulfilled' ? stocksRes.value : null,
            news: newsRes.status === 'fulfilled' ? newsRes.value : null,
            sentiment: sentimentRes.status === 'fulfilled' ? sentimentRes.value : null,
            stocksError: stocksRes.status === 'rejected' ? stocksRes.reason : null,
            newsError: newsRes.status === 'rejected' ? newsRes.reason : null,
            sentimentError: sentimentRes.status === 'rejected' ? sentimentRes.reason : null,
          };
        })
      );

      // Aggregate results
      const result: PortfolioBatchData = {
        stocks: {},
        news: {},
        sentiment: {},
        errors: {}
      };

      batchResults.forEach((batch) => {
        if (batch.stocks) {
          Object.assign(result.stocks, batch.stocks.data);
          Object.assign(result.errors, batch.stocks.errors);
        }
        if (batch.news) {
          Object.assign(result.news, batch.news.data);
          // Merge errors, careful not to overwrite existing ones if possible,
          // but tickers are unique per batch so it's fine.
          // However, same ticker might fail in stocks AND news.
          // So we might want to key errors by "ticker-type" or just accumulate.
          // For simplicity, last write wins for now, or we append.
          Object.entries(batch.news.errors).forEach(([ticker, err]) => {
            if (result.errors[ticker]) {
              result.errors[ticker] += `; News: ${err}`;
            } else {
              result.errors[ticker] = `News: ${err}`;
            }
          });
        }
        if (batch.sentiment) {
          Object.assign(result.sentiment, batch.sentiment.data);
          Object.entries(batch.sentiment.errors).forEach(([ticker, err]) => {
            if (result.errors[ticker]) {
              result.errors[ticker] += `; Sentiment: ${err}`;
            } else {
              result.errors[ticker] = `Sentiment: ${err}`;
            }
          });
        }
      });

      return result;
    },
    enabled: tickers.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return { data, isLoading, error, refetch };
}

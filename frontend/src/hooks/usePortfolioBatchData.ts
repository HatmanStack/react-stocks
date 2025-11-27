import { useQuery } from '@tanstack/react-query';
import {
  fetchBatchStocks,
  fetchBatchNews,
  fetchBatchSentiment,
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
            tickers: batchTickers,
            stocks: stocksRes.status === 'fulfilled' ? stocksRes.value : null,
            news: newsRes.status === 'fulfilled' ? newsRes.value : null,
            sentiment: sentimentRes.status === 'fulfilled' ? sentimentRes.value : null,
            stocksError: stocksRes.status === 'rejected' ? String(stocksRes.reason) : null,
            newsError: newsRes.status === 'rejected' ? String(newsRes.reason) : null,
            sentimentError: sentimentRes.status === 'rejected' ? String(sentimentRes.reason) : null,
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

      // Helper to append error for a ticker
      const appendError = (ticker: string, error: string) => {
        if (result.errors[ticker]) {
          result.errors[ticker] += `; ${error}`;
        } else {
          result.errors[ticker] = error;
        }
      };

      batchResults.forEach((batch) => {
        // Handle stocks data or HTTP-level error
        if (batch.stocks) {
          Object.assign(result.stocks, batch.stocks.data);
          Object.assign(result.errors, batch.stocks.errors);
        } else if (batch.stocksError) {
          batch.tickers.forEach(ticker => appendError(ticker, `Stocks: ${batch.stocksError}`));
        }

        // Handle news data or HTTP-level error
        if (batch.news) {
          Object.assign(result.news, batch.news.data);
          Object.entries(batch.news.errors).forEach(([ticker, err]) => {
            appendError(ticker, `News: ${err}`);
          });
        } else if (batch.newsError) {
          batch.tickers.forEach(ticker => appendError(ticker, `News: ${batch.newsError}`));
        }

        // Handle sentiment data or HTTP-level error
        if (batch.sentiment) {
          Object.assign(result.sentiment, batch.sentiment.data);
          Object.entries(batch.sentiment.errors).forEach(([ticker, err]) => {
            appendError(ticker, `Sentiment: ${err}`);
          });
        } else if (batch.sentimentError) {
          batch.tickers.forEach(ticker => appendError(ticker, `Sentiment: ${batch.sentimentError}`));
        }
      });

      return result;
    },
    enabled: tickers.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return { data, isLoading, error, refetch };
}

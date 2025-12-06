/**
 * Stock Data Synchronization Service
 * Fetches stock prices and symbol metadata from Tiingo and stores in database
 */

import {
  fetchStockPrices,
  fetchSymbolMetadata,
  transformTiingoToStockDetails,
  transformTiingoToSymbolDetails,
} from '@/services/api/tiingo.service';
import * as StockRepository from '@/database/repositories/stock.repository';
import * as SymbolRepository from '@/database/repositories/symbol.repository';
import { logger } from '@/utils/logger';

/**
 * Sync stock price data for a ticker and date range
 * @param ticker - Stock ticker symbol
 * @param startDate - Start date (YYYY-MM-DD)
 * @param endDate - End date (YYYY-MM-DD)
 * @returns Number of records inserted/updated
 */
export async function syncStockData(
  ticker: string,
  startDate: string,
  endDate: string
): Promise<number> {
  try {
    console.log(
      `[StockDataSync] Syncing stock data for ${ticker} from ${startDate} to ${endDate}`
    );

    // Check if data already exists for this range
    const existingData = await StockRepository.findByTickerAndDateRange(
      ticker,
      startDate,
      endDate
    );

    // Calculate expected trading days (roughly 5 per week, use 50% threshold)
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const expectedMinRecords = Math.floor(daysDiff * 5 / 7 * 0.5);

    if (existingData.length >= expectedMinRecords) {
      console.log(
        `[StockDataSync] Found ${existingData.length} existing records for ${ticker} (min: ${expectedMinRecords}), skipping fetch`
      );
      return 0;
    }

    console.log(
      `[StockDataSync] Found ${existingData.length} records but need ${expectedMinRecords}, fetching more for ${ticker}`
    );

    // Fetch stock prices from Tiingo
    const tiingoData = await fetchStockPrices(ticker, startDate, endDate);

    if (tiingoData.length === 0) {
      console.warn(`[StockDataSync] No stock data found for ${ticker}`);
      return 0;
    }

    // Transform and insert into database
    const stockDetails = tiingoData.map((price) =>
      transformTiingoToStockDetails(price, ticker)
    );

    logger.debug(`[StockDataSync] Sample of first 3 price records:`, stockDetails.slice(0, 3));

    await StockRepository.insertMany(stockDetails);

    console.log(
      `[StockDataSync] Inserted ${stockDetails.length} stock records for ${ticker}`
    );

    // Fetch and store symbol metadata if not exists
    const symbolExists = await SymbolRepository.existsByTicker(ticker);

    if (!symbolExists) {
      try {
        const metadata = await fetchSymbolMetadata(ticker);
        const symbolDetails = transformTiingoToSymbolDetails(metadata);
        await SymbolRepository.insert(symbolDetails);

        console.log(`[StockDataSync] Inserted symbol metadata for ${ticker}`);
      } catch (error) {
        console.error(
          `[StockDataSync] Failed to fetch symbol metadata for ${ticker}:`,
          error
        );
        // Continue even if metadata fetch fails
      }
    }

    return stockDetails.length;
  } catch (error) {
    console.error(
      `[StockDataSync] Error syncing stock data for ${ticker}:`,
      error
    );
    throw new Error(`Failed to sync stock data for ${ticker}: ${error}`);
  }
}

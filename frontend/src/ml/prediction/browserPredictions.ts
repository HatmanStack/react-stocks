/**
 * Browser-Based Prediction Generation
 *
 * Coordinates stock data fetching, sentiment alignment, feature extraction,
 * and logistic regression model invocation to produce predictions.
 */

import * as StockRepository from '@/database/repositories/stock.repository';
import { syncStockData } from '@/services/sync/stockDataSync';
import { formatDateForDB } from '@/utils/date/dateUtils';
import { subDays } from 'date-fns';
import { getStockPredictions, parsePredictionResponse } from '@/ml/prediction/prediction.service';
import type { CombinedWordDetails, EventType } from '@/types/database.types';
import type { Predictions } from '@/utils/sentiment/dataTransformer';
import { MIN_SENTIMENT_DATA, MIN_STOCK_DATA } from '@/constants/ml.constants';

/**
 * Generate predictions using browser-based logistic regression.
 *
 * Steps:
 * 1. Validate sentiment data length
 * 2. Sync and fetch stock price data
 * 3. Align stock and sentiment by date (with interpolation)
 * 4. Extract features (prices, volumes, event types, aspect/ML scores)
 * 5. Run ensemble logistic regression model
 *
 * @returns Predictions or null if insufficient data
 */
export async function generateBrowserPredictions(
  ticker: string,
  sentimentData: CombinedWordDetails[],
  days: number
): Promise<Predictions | null> {
  console.log(`[Predictions] Starting for ${ticker} (${sentimentData.length} sentiment days)`);

  try {
    if (sentimentData.length < MIN_SENTIMENT_DATA) {
      console.log(`[Predictions] Insufficient sentiment: ${sentimentData.length}/${MIN_SENTIMENT_DATA}`);
      return null;
    }

    // Fetch enough stock data for the model
    const minCalendarDays = Math.ceil(MIN_STOCK_DATA * 1.5);
    const effectiveDays = Math.max(days, minCalendarDays);
    const stockEndStr = formatDateForDB(new Date());
    const stockStartStr = formatDateForDB(subDays(new Date(), effectiveDays));

    try {
      await syncStockData(ticker, stockStartStr, stockEndStr, MIN_STOCK_DATA);
    } catch (syncError) {
      console.warn(`[Predictions] Stock sync failed, using local data:`, syncError);
    }

    const stockData = await StockRepository.findByTickerAndDateRange(
      ticker, stockStartStr, stockEndStr
    );

    if (stockData.length < MIN_STOCK_DATA) {
      console.log(`[Predictions] Insufficient stock data: ${stockData.length}/${MIN_STOCK_DATA}`);
      return null;
    }

    // Sort and align datasets
    const sortedStocks = [...stockData].sort((a, b) => a.date.localeCompare(b.date));
    const sortedSentiment = [...sentimentData].sort((a, b) => a.date.localeCompare(b.date));

    const stockByDate = new Map(sortedStocks.map(s => [s.date, s]));
    const sentimentByDate = new Map(sortedSentiment.map(s => [s.date, s]));

    const tradingDays = [...stockByDate.keys()].sort();
    const sentimentDates = [...sentimentByDate.keys()].sort();
    const firstSentimentDate = sentimentDates[0];
    const lastSentimentDate = sentimentDates[sentimentDates.length - 1];

    // Interpolate sentiment for each trading day
    const trimmedStocks: typeof sortedStocks = [];
    const trimmedSentiment: typeof sortedSentiment = [];

    for (const tradingDay of tradingDays) {
      const stock = stockByDate.get(tradingDay)!;
      let sentiment = sentimentByDate.get(tradingDay);

      if (!sentiment) {
        if (tradingDay < firstSentimentDate) {
          sentiment = sentimentByDate.get(firstSentimentDate);
        } else if (tradingDay > lastSentimentDate) {
          sentiment = sentimentByDate.get(lastSentimentDate);
        } else {
          const priorDates = sentimentDates.filter(d => d <= tradingDay);
          if (priorDates.length > 0) {
            sentiment = sentimentByDate.get(priorDates[priorDates.length - 1]);
          }
        }
      }

      if (sentiment) {
        trimmedStocks.push(stock);
        trimmedSentiment.push(sentiment);
      }
    }

    if (trimmedStocks.length < MIN_STOCK_DATA) {
      console.log(`[Predictions] After alignment: ${trimmedStocks.length}/${MIN_STOCK_DATA}`);
      return null;
    }

    // Extract features
    const closePrices = trimmedStocks.map(s => s.close);
    const volumes = trimmedStocks.map(s => s.volume);

    const eventTypes: EventType[] = [];
    const aspectScores: number[] = [];
    const mlScores: (number | null)[] = [];

    for (const day of trimmedSentiment) {
      let dominantEvent: EventType = 'GENERAL';
      if (day.eventCounts) {
        try {
          const counts = JSON.parse(day.eventCounts) as Record<string, number>;
          const nonGeneral = Object.entries(counts).filter(([t]) => t !== 'GENERAL');
          if (nonGeneral.length > 0) {
            const [type] = nonGeneral.reduce((max, curr) => curr[1] > max[1] ? curr : max);
            dominantEvent = type as EventType;
          }
        } catch {
          // Use default GENERAL
        }
      }
      eventTypes.push(dominantEvent);
      aspectScores.push(day.avgAspectScore ?? 0);
      mlScores.push(day.avgMlScore ?? null);
    }

    const sentimentAvailability = mlScores.filter(s => s !== null).length / mlScores.length;
    console.log(`[Predictions] Features: ${closePrices.length} days, sentiment availability: ${(sentimentAvailability * 100).toFixed(1)}%`);

    // Run logistic regression ensemble
    const response = await getStockPredictions(
      ticker, closePrices, volumes,
      [], [], [], // deprecated params
      eventTypes, aspectScores, mlScores
    );

    const parsed = parsePredictionResponse(response);

    const toPrediction = (value: number | null): { direction: 'up' | 'down'; probability: number } | null => {
      if (value == null) return null;
      const isDown = value >= 0.5;
      return {
        direction: isDown ? 'down' : 'up',
        probability: isDown ? value : (1 - value),
      };
    };

    const predictions: Predictions = {
      nextDay: toPrediction(parsed.nextDay),
      twoWeek: toPrediction(parsed.twoWeeks),
      oneMonth: toPrediction(parsed.oneMonth),
    };

    console.log(`[Predictions] Generated for ${ticker}:`, predictions);
    return predictions;
  } catch (error) {
    console.error(`[Predictions] Failed for ${ticker}:`, error);
    return null;
  }
}

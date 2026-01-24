/**
 * Stock Prediction Service (Browser-Based ML)
 *
 * JavaScript implementation of the Python logistic regression prediction service.
 * Provides stock price predictions for three time horizons using browser-native ML.
 *
 * **Phase 5 Update:** Now uses three-signal sentiment architecture for improved accuracy.
 */

import { StandardScaler } from './scaler';
import { LogisticRegressionCV } from './cross-validation';
import { buildFeatureMatrix, buildPriceOnlyFeatureMatrix, createLabels, TREND_WINDOW, FEATURE_NAMES, PRICE_ONLY_FEATURE_NAMES } from './preprocessing';
import type { PredictionInput, PredictionOutput } from './types';
import type { EventType } from '../../types/database.types';

/**
 * Compute ANOVA F-statistic for each feature vs binary labels.
 * Higher F = more discriminative. p-value from F(1, n-2) distribution.
 */
function computeFeatureFStats(
  X: number[][],
  y: number[],
  featureNames: readonly string[]
): { name: string; F: number; pValue: number }[] {
  const n = y.length;
  const nFeatures = X[0].length;
  const results: { name: string; F: number; pValue: number }[] = [];

  for (let j = 0; j < nFeatures; j++) {
    // Split feature values by class
    const class0: number[] = [];
    const class1: number[] = [];
    for (let i = 0; i < n; i++) {
      if (y[i] === 0) class0.push(X[i][j]);
      else class1.push(X[i][j]);
    }

    const n0 = class0.length;
    const n1 = class1.length;
    if (n0 === 0 || n1 === 0) {
      results.push({ name: featureNames[j], F: 0, pValue: 1 });
      continue;
    }

    const mean0 = class0.reduce((s, v) => s + v, 0) / n0;
    const mean1 = class1.reduce((s, v) => s + v, 0) / n1;
    const grandMean = (mean0 * n0 + mean1 * n1) / n;

    // Between-group variance (SSB / df_between)
    const ssb = n0 * (mean0 - grandMean) ** 2 + n1 * (mean1 - grandMean) ** 2;

    // Within-group variance (SSW / df_within)
    let ssw = 0;
    for (const v of class0) ssw += (v - mean0) ** 2;
    for (const v of class1) ssw += (v - mean1) ** 2;

    const dfBetween = 1; // k-1 where k=2 classes
    const dfWithin = n - 2;

    const msb = ssb / dfBetween;
    const msw = ssw / dfWithin;
    const F = msw > 0 ? msb / msw : 0;

    // Approximate p-value from F(1, n-2) using beta incomplete function approximation
    const pValue = fDistPValue(F, dfBetween, dfWithin);

    results.push({ name: featureNames[j], F, pValue });
  }

  return results.sort((a, b) => b.F - a.F); // Sort by F descending
}

/** Approximate p-value for F-distribution using the relationship to Beta distribution */
function fDistPValue(F: number, d1: number, d2: number): number {
  if (F <= 0) return 1;
  const x = d2 / (d2 + d1 * F);
  return betaIncomplete(d2 / 2, d1 / 2, x);
}

/** Regularized incomplete beta function (continued fraction approximation) */
function betaIncomplete(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry for better convergence when x > threshold
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncomplete(b, a, 1 - x);
  }

  const maxIter = 200;
  const eps = 1e-10;
  const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  // Lentz's continued fraction method
  let f = 1, c = 1, d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  f = d;

  for (let i = 1; i <= maxIter; i++) {
    const m = i;
    // Even step
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d; if (Math.abs(d) < eps) d = eps; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < eps) c = eps;
    f *= d * c;
    // Odd step
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d; if (Math.abs(d) < eps) d = eps; d = 1 / d;
    c = 1 + num / c; if (Math.abs(c) < eps) c = eps;
    f *= d * c;
    if (Math.abs(d * c - 1) < eps) break;
  }

  return front * f;
}

/** Log gamma function (Lanczos approximation) */
function lnGamma(z: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Time horizons for predictions (in trading days)
 */
const HORIZONS = {
  NEXT: 1, // Next day
  WEEK: 10, // 2 weeks
  MONTH: 21, // 1 month
} as const;

/**
 * Minimum data points required for predictions.
 * Must cover TREND_WINDOW (20) + horizon (1 min) + MIN_LABELS_PER_HORIZON (25) = 46
 */
const MIN_DATA_POINTS = 46;

/**
 * Minimum labels for NEXT horizon (independent, no overlap).
 */
const MIN_LABELS_NEXT = 25;

/**
 * Minimum independent (non-overlapping) samples for WEEK/MONTH horizons.
 * 10 independent observations ≈ 6 months (WEEK) or 1 year (MONTH).
 */
const MIN_INDEPENDENT_SAMPLES = 10;

/**
 * Get stock price predictions using logistic regression model
 *
 * **Phase 5 Update:** Now accepts three-signal sentiment parameters for improved accuracy.
 * Legacy parameters (positiveCounts, negativeCounts, sentimentScores) are deprecated but
 * maintained for backward compatibility.
 *
 * @param ticker - Stock ticker symbol
 * @param closePrices - Array of closing prices
 * @param volumes - Array of trading volumes
 * @param positiveCounts - (DEPRECATED) Array of positive word counts
 * @param negativeCounts - (DEPRECATED) Array of negative word counts
 * @param sentimentScores - (DEPRECATED) Array of sentiment categories
 * @param eventTypes - Array of event type classifications
 * @param aspectScores - Array of aspect sentiment scores (-1 to +1)
 * @param mlScores - Array of ML model scores (-1 to +1)
 * @param signalScores - Array of signal scores (0 to 1, metadata quality)
 * @returns Prediction results for next day, 2 weeks, and 1 month
 * @throws Error if insufficient data or invalid inputs
 *
 * @example
 * ```typescript
 * // New usage with three-signal sentiment
 * const predictions = await getStockPredictions(
 *   'AAPL',
 *   closePrices,
 *   volumes,
 *   [], // deprecated
 *   [], // deprecated
 *   [], // deprecated
 *   eventTypes,
 *   aspectScores,
 *   mlScores
 * );
 * ```
 */
export async function getStockPredictions(
  ticker: string,
  closePrices: number[],
  volumes: number[],
  _positiveCounts: number[] = [],
  _negativeCounts: number[] = [],
  _sentimentScores: string[] = [],
  eventTypes?: EventType[],
  aspectScores?: number[],
  mlScores?: (number | null)[],
  signalScores?: number[]
): Promise<PredictionOutput> {
  const startTime = performance.now();

  try {
    // Validate inputs
    if (!ticker) {
      throw new Error('Ticker symbol is required');
    }

    if (closePrices.length < MIN_DATA_POINTS) {
      throw new Error(
        `Insufficient data: need at least ${MIN_DATA_POINTS} data points, got ${closePrices.length}`
      );
    }

    // Build input structure with three-signal sentiment
    const input: PredictionInput = {
      ticker,
      close: closePrices,
      volume: volumes,
      eventType: eventTypes,
      aspectScore: aspectScores,
      mlScore: mlScores,
      signalScore: signalScores,
    };

    console.log(
      `[PredictionService] Generating predictions for ${ticker} (${closePrices.length} data points)` +
        (eventTypes ? ` with three-signal sentiment` : ` without sentiment signals`)
    );
    console.log(`[PredictionService] Input validation:`);
    console.log(`  - closePrices: ${closePrices.length} (first: ${closePrices[0]?.toFixed(2)}, last: ${closePrices[closePrices.length-1]?.toFixed(2)})`);
    console.log(`  - volumes: ${volumes.length}`);
    console.log(`  - eventTypes: ${eventTypes?.length || 0}`);
    console.log(`  - aspectScores: ${aspectScores?.length || 0} (non-zero: ${aspectScores?.filter(s => s !== 0).length || 0})`);
    console.log(`  - mlScores: ${mlScores?.length || 0} (with data: ${mlScores?.filter(s => s !== null).length || 0})`);
    console.log(`  - signalScores: ${signalScores?.length || 0}`);

    // Build both feature matrices for ensemble
    console.log(`[PredictionService] Building feature matrices (ensemble)...`);
    const fullFeatures = buildFeatureMatrix(input);
    const priceFeatures = buildPriceOnlyFeatureMatrix(input);
    console.log(`[PredictionService] Full matrix: ${fullFeatures.length}x${fullFeatures[0]?.length || 0}, Price matrix: ${priceFeatures.length}x${priceFeatures[0]?.length || 0}`);

    // Sentiment availability is feature index 7 in full matrix (same for all rows)
    const sentimentAvailability = fullFeatures.length > 0 ? fullFeatures[0][7] : 0;
    console.log(`[PredictionService] Ensemble weights: full=${sentimentAvailability.toFixed(3)}, price=${(1 - sentimentAvailability).toFixed(3)}`);

    // Make predictions for each horizon using ensemble
    const predictions: { [key: string]: number | null } = {};

    for (const [name, horizon] of Object.entries(HORIZONS)) {
      // Generate labels for this horizon
      const allLabels = createLabels(closePrices, horizon);

      // Align features with labels (labels start at TREND_WINDOW index)
      const allFullFeatures = fullFeatures.slice(TREND_WINDOW, TREND_WINDOW + allLabels.length);
      const allPriceFeatures = priceFeatures.slice(TREND_WINDOW, TREND_WINDOW + allLabels.length);

      // For horizon > 1: use non-overlapping subsample (every horizon-th element)
      // to get truly independent observations. NEXT (horizon=1) has no overlap.
      let X_full: number[][];
      let X_price: number[][];
      let y: number[];

      if (horizon > 1) {
        X_full = [];
        X_price = [];
        y = [];
        for (let i = 0; i < allLabels.length; i += horizon) {
          X_full.push(allFullFeatures[i]);
          X_price.push(allPriceFeatures[i]);
          y.push(allLabels[i]);
        }

        if (y.length < MIN_INDEPENDENT_SAMPLES) {
          console.warn(
            `[PredictionService] ${ticker} ${name}: Insufficient independent samples (${y.length}/${MIN_INDEPENDENT_SAMPLES}), ` +
              `need ~${MIN_INDEPENDENT_SAMPLES * horizon + horizon + TREND_WINDOW} trading days`
          );
          predictions[name] = null;
          continue;
        }
      } else {
        X_full = allFullFeatures;
        X_price = allPriceFeatures;
        y = allLabels;

        if (y.length < MIN_LABELS_NEXT) {
          console.warn(
            `[PredictionService] ${ticker} ${name}: Insufficient labels (${y.length}/${MIN_LABELS_NEXT})`
          );
          predictions[name] = null;
          continue;
        }
      }

      // Generate exponential decay weights for time-weighted sampling
      const n = y.length;
      const halfLife = Math.max(10, n / 4);
      const lambda = Math.log(2) / halfLife;
      const sampleWeights: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const age = n - 1 - i;
        sampleWeights[i] = Math.exp(-lambda * age);
      }

      const trainOptions = {
        sampleWeights,
        classWeight: 'balanced' as const,
        maxIterations: 2000,
        learningRate: 0.005,
      };
      const k = Math.min(8, y.length);

      if (horizon === 1) {
        // --- F-test diagnostic (NEXT horizon has most samples) ---
        const fStats = computeFeatureFStats(X_full, y, FEATURE_NAMES);
        console.log(`[F-Test] ${ticker} NEXT (${y.length} samples, class split: ${y.filter(v=>v===0).length}/${y.filter(v=>v===1).length}):`);
        console.table(fStats.map(f => ({
          feature: f.name,
          F: f.F.toFixed(3),
          pValue: f.pValue < 0.001 ? '<0.001' : f.pValue.toFixed(3),
          sig: f.pValue < 0.05 ? '***' : f.pValue < 0.1 ? '*' : '',
        })));

        const priceFStats = computeFeatureFStats(X_price, y, PRICE_ONLY_FEATURE_NAMES);
        console.log(`[F-Test] ${ticker} NEXT price-only model:`);
        console.table(priceFStats.map(f => ({
          feature: f.name,
          F: f.F.toFixed(3),
          pValue: f.pValue < 0.001 ? '<0.001' : f.pValue.toFixed(3),
          sig: f.pValue < 0.05 ? '***' : f.pValue < 0.1 ? '*' : '',
        })));

        // --- NEXT: Full ensemble (10-feature + 5-feature merged by sentiment availability) ---
        const fullScaler = new StandardScaler();
        const X_full_scaled = fullScaler.fitTransform(X_full);
        const fullModel = new LogisticRegressionCV();
        if (k < 2) {
          fullModel.fit(X_full_scaled, y, trainOptions);
        } else {
          fullModel.fitCV(X_full_scaled, y, k, trainOptions);
        }
        const X_full_recent = fullScaler.transform([fullFeatures[fullFeatures.length - 1]]);
        const fullPred = fullModel.predictProba(X_full_recent)[0][1];

        const priceScaler = new StandardScaler();
        const X_price_scaled = priceScaler.fitTransform(X_price);
        const priceModel = new LogisticRegressionCV();
        if (k < 2) {
          priceModel.fit(X_price_scaled, y, trainOptions);
        } else {
          priceModel.fitCV(X_price_scaled, y, k, trainOptions);
        }
        const X_price_recent = priceScaler.transform([priceFeatures[priceFeatures.length - 1]]);
        const pricePred = priceModel.predictProba(X_price_recent)[0][1];

        const mergedPred = fullPred * sentimentAvailability + pricePred * (1 - sentimentAvailability);
        predictions[name] = mergedPred;

        console.log(
          `[Ensemble] ${ticker} ${name}: full=${fullPred.toFixed(4)}, price=${pricePred.toFixed(4)}, ` +
            `weight=${sentimentAvailability.toFixed(2)}, merged=${mergedPred.toFixed(4)}`
        );
      } else {
        // --- WEEK/MONTH: Price-only model (5 features) to avoid overfit with few samples ---
        const priceScaler = new StandardScaler();
        const X_price_scaled = priceScaler.fitTransform(X_price);
        const priceModel = new LogisticRegressionCV();
        if (k < 2) {
          priceModel.fit(X_price_scaled, y, trainOptions);
        } else {
          priceModel.fitCV(X_price_scaled, y, k, trainOptions);
        }
        const X_price_recent = priceScaler.transform([priceFeatures[priceFeatures.length - 1]]);
        const pricePred = priceModel.predictProba(X_price_recent)[0][1];
        predictions[name] = pricePred;

        console.log(
          `[Ensemble] ${ticker} ${name}: price-only=${pricePred.toFixed(4)} (${y.length} samples, 5 features)`
        );
      }
    }

    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(2);

    console.log(
      `[PredictionService] Predictions for ${ticker}: ` +
        `next=${predictions.NEXT}, week=${predictions.WEEK}, month=${predictions.MONTH} ` +
        `(${duration}ms)`
    );

    // Format response - null for insufficient data, 4 decimal places otherwise
    return {
      next: predictions.NEXT != null ? predictions.NEXT.toFixed(4) : null,
      week: predictions.WEEK != null ? predictions.WEEK.toFixed(4) : null,
      month: predictions.MONTH != null ? predictions.MONTH.toFixed(4) : null,
      ticker,
    };
  } catch (error) {
    console.error('[PredictionService] Error generating predictions:', error);
    throw error;
  }
}

/**
 * Parse prediction response to numeric values
 * (Kept for compatibility with existing code)
 *
 * @param response - Prediction response
 * @returns Parsed prediction values as numbers
 */
export function parsePredictionResponse(response: PredictionOutput): {
  nextDay: number | null;
  twoWeeks: number | null;
  oneMonth: number | null;
  ticker: string;
} {
  return {
    nextDay: response.next != null ? parseFloat(response.next) : null,
    twoWeeks: response.week != null ? parseFloat(response.week) : null,
    oneMonth: response.month != null ? parseFloat(response.month) : null,
    ticker: response.ticker,
  };
}

/**
 * Get default predictions when insufficient data
 *
 * @param ticker - Stock ticker symbol
 * @returns Default prediction response (all 0.0)
 */
export function getDefaultPredictions(ticker: string): PredictionOutput {
  console.warn(
    `[PredictionService] Using default predictions for ${ticker} (insufficient data)`
  );

  return {
    next: '0.0',
    week: '0.0',
    month: '0.0',
    ticker,
  };
}

/**
 * CloudWatch Embedded Metrics Format (EMF) Utility
 *
 * Provides functions to log custom metrics to CloudWatch using EMF.
 * Lambda automatically parses EMF JSON from console.log and creates metrics.
 *
 * @see https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 */

/**
 * Metric units supported by CloudWatch
 */
export enum MetricUnit {
  Seconds = 'Seconds',
  Microseconds = 'Microseconds',
  Milliseconds = 'Milliseconds',
  Bytes = 'Bytes',
  Kilobytes = 'Kilobytes',
  Megabytes = 'Megabytes',
  Gigabytes = 'Gigabytes',
  Terabytes = 'Terabytes',
  Bits = 'Bits',
  Kilobits = 'Kilobits',
  Megabits = 'Megabits',
  Gigabits = 'Gigabits',
  Terabits = 'Terabits',
  Percent = 'Percent',
  Count = 'Count',
  BytesPerSecond = 'Bytes/Second',
  KilobytesPerSecond = 'Kilobytes/Second',
  MegabytesPerSecond = 'Megabytes/Second',
  GigabytesPerSecond = 'Gigabytes/Second',
  TerabytesPerSecond = 'Terabytes/Second',
  BitsPerSecond = 'Bits/Second',
  KilobitsPerSecond = 'Kilobits/Second',
  MegabitsPerSecond = 'Megabits/Second',
  GigabitsPerSecond = 'Gigabits/Second',
  TerabitsPerSecond = 'Terabits/Second',
  CountPerSecond = 'Count/Second',
  None = 'None',
}

/**
 * CloudWatch EMF structure
 */
interface EMFMetric {
  _aws: {
    Timestamp: number;
    CloudWatchMetrics: Array<{
      Namespace: string;
      Dimensions: string[][];
      Metrics: Array<{
        Name: string;
        Unit: MetricUnit;
      }>;
    }>;
  };
  [key: string]: any; // Metric values and dimensions
}

const NAMESPACE = 'ReactStocks';

/**
 * Log a metric to CloudWatch using EMF format
 *
 * @param name - Metric name (e.g., 'CacheHitRate')
 * @param value - Metric value (e.g., 95.5)
 * @param unit - Metric unit (e.g., MetricUnit.Percent)
 * @param dimensions - Key-value pairs for filtering (e.g., { Endpoint: 'stocks', Ticker: 'AAPL' })
 *
 * @example
 * logMetric('CacheHitRate', 95.5, MetricUnit.Percent, { Endpoint: 'stocks', Ticker: 'AAPL' });
 */
export function logMetric(
  name: string,
  value: number,
  unit: MetricUnit = MetricUnit.None,
  dimensions: Record<string, string> = {}
): void {
  const timestamp = Date.now();

  // Build dimension keys array
  const dimensionKeys = Object.keys(dimensions);

  // Build EMF structure
  const emf: EMFMetric = {
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: [dimensionKeys], // CloudWatch will create metrics for this dimension combination
          Metrics: [
            {
              Name: name,
              Unit: unit,
            },
          ],
        },
      ],
    },
  };

  // Add metric value
  emf[name] = value;

  // Add dimension values
  Object.entries(dimensions).forEach(([key, val]) => {
    emf[key] = val;
  });

  // Output as JSON to be parsed by Lambda
  console.log(JSON.stringify(emf));
}

/**
 * Log multiple metrics in a single EMF entry
 * More efficient than multiple logMetric calls
 *
 * @param metrics - Array of metric definitions
 * @param dimensions - Shared dimensions for all metrics
 *
 * @example
 * logMetrics([
 *   { name: 'CacheHitRate', value: 95.5, unit: MetricUnit.Percent },
 *   { name: 'RequestDuration', value: 150, unit: MetricUnit.Milliseconds }
 * ], { Endpoint: 'stocks', Ticker: 'AAPL' });
 */
export function logMetrics(
  metrics: Array<{
    name: string;
    value: number;
    unit?: MetricUnit;
  }>,
  dimensions: Record<string, string> = {}
): void {
  const timestamp = Date.now();

  const dimensionKeys = Object.keys(dimensions);

  const emf: EMFMetric = {
    _aws: {
      Timestamp: timestamp,
      CloudWatchMetrics: [
        {
          Namespace: NAMESPACE,
          Dimensions: [dimensionKeys],
          Metrics: metrics.map((m) => ({
            Name: m.name,
            Unit: m.unit || MetricUnit.None,
          })),
        },
      ],
    },
  };

  // Add all metric values
  metrics.forEach((m) => {
    emf[m.name] = m.value;
  });

  // Add dimension values
  Object.entries(dimensions).forEach(([key, val]) => {
    emf[key] = val;
  });

  console.log(JSON.stringify(emf));
}

/**
 * Measure execution time of an async function and log duration metric
 *
 * @param fn - Async function to measure
 * @param metricName - Name for the duration metric
 * @param dimensions - Dimensions for the metric
 * @returns Result of the function
 *
 * @example
 * const data = await measureDuration(
 *   () => fetchStockPrices('AAPL', '2025-01-01'),
 *   'TiingoAPILatency',
 *   { API: 'Tiingo', Endpoint: 'stocks' }
 * );
 */
export async function measureDuration<T>(
  fn: () => Promise<T>,
  metricName: string,
  dimensions: Record<string, string> = {}
): Promise<T> {
  const startTime = Date.now();

  try {
    const result = await fn();
    const duration = Date.now() - startTime;

    logMetric(metricName, duration, MetricUnit.Milliseconds, dimensions);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log duration even on error
    logMetric(metricName, duration, MetricUnit.Milliseconds, {
      ...dimensions,
      Error: 'true',
    });

    throw error;
  }
}

/**
 * DistilFinBERT metrics tracking
 *
 * NEW (Phase 3): Specialized metrics for DistilFinBERT service monitoring
 */

/**
 * Log DistilFinBERT API call metrics
 *
 * Tracks calls to external DistilFinBERT service for performance monitoring.
 *
 * @param ticker - Stock ticker
 * @param durationMs - API call duration in milliseconds
 * @param success - Whether call succeeded
 * @param cacheHit - Whether result was served from cache
 *
 * @example
 * logDistilFinBERTCall('AAPL', 450, true, false);
 */
export function logDistilFinBERTCall(
  ticker: string,
  durationMs: number,
  success: boolean,
  cacheHit: boolean
): void {
  logMetrics(
    [
      { name: 'DistilFinBERTCalls', value: 1, unit: MetricUnit.Count },
      { name: 'DistilFinBERTDuration', value: durationMs, unit: MetricUnit.Milliseconds },
    ],
    {
      Ticker: ticker,
      Success: success ? 'true' : 'false',
      CacheHit: cacheHit ? 'true' : 'false',
      Service: 'DistilFinBERT',
    }
  );
}

/**
 * Log DistilFinBERT batch processing metrics
 *
 * Tracks performance of batch sentiment analysis operations.
 *
 * @param ticker - Stock ticker
 * @param totalArticles - Total articles processed
 * @param materialEvents - Number of material events (invoked DistilFinBERT)
 * @param successCount - Number of successful DistilFinBERT calls
 * @param avgDurationMs - Average duration per material event
 *
 * @example
 * logDistilFinBERTBatch('AAPL', 100, 25, 23, 450);
 */
export function logDistilFinBERTBatch(
  ticker: string,
  totalArticles: number,
  materialEvents: number,
  successCount: number,
  avgDurationMs: number
): void {
  const failureCount = materialEvents - successCount;
  const successRate = materialEvents > 0 ? (successCount / materialEvents) * 100 : 100;
  const materialEventRate = totalArticles > 0 ? (materialEvents / totalArticles) * 100 : 0;

  logMetrics(
    [
      { name: 'DistilFinBERTBatchSize', value: totalArticles, unit: MetricUnit.Count },
      { name: 'DistilFinBERTMaterialEvents', value: materialEvents, unit: MetricUnit.Count },
      { name: 'DistilFinBERTSuccesses', value: successCount, unit: MetricUnit.Count },
      { name: 'DistilFinBERTFailures', value: failureCount, unit: MetricUnit.Count },
      { name: 'DistilFinBERTSuccessRate', value: successRate, unit: MetricUnit.Percent },
      {
        name: 'DistilFinBERTMaterialEventRate',
        value: materialEventRate,
        unit: MetricUnit.Percent,
      },
      {
        name: 'DistilFinBERTAvgDuration',
        value: avgDurationMs,
        unit: MetricUnit.Milliseconds,
      },
    ],
    {
      Ticker: ticker,
      Service: 'DistilFinBERT',
    }
  );
}

/**
 * Log DistilFinBERT cache hit rate
 *
 * Tracks effectiveness of DynamoDB caching for DistilFinBERT results.
 *
 * @param ticker - Stock ticker
 * @param hits - Number of cache hits
 * @param misses - Number of cache misses
 *
 * @example
 * logDistilFinBERTCacheHitRate('AAPL', 18, 2); // 90% hit rate
 */
export function logDistilFinBERTCacheHitRate(
  ticker: string,
  hits: number,
  misses: number
): void {
  const total = hits + misses;
  const hitRate = total > 0 ? (hits / total) * 100 : 0;

  logMetrics(
    [
      { name: 'DistilFinBERTCacheHits', value: hits, unit: MetricUnit.Count },
      { name: 'DistilFinBERTCacheMisses', value: misses, unit: MetricUnit.Count },
      { name: 'DistilFinBERTCacheHitRate', value: hitRate, unit: MetricUnit.Percent },
    ],
    {
      Ticker: ticker,
      Service: 'DistilFinBERT',
    }
  );
}

/**
 * Log DistilFinBERT fallback usage
 *
 * Tracks when bag-of-words sentiment is used instead of DistilFinBERT.
 * High fallback rate indicates service availability issues.
 *
 * @param ticker - Stock ticker
 * @param fallbackCount - Number of times fallback was used
 * @param totalMaterialEvents - Total number of material events
 * @param reason - Reason for fallback (timeout, error, service_unavailable)
 *
 * @example
 * logDistilFinBERTFallback('AAPL', 3, 25, 'timeout');
 */
export function logDistilFinBERTFallback(
  ticker: string,
  fallbackCount: number,
  totalMaterialEvents: number,
  reason: string
): void {
  const fallbackRate =
    totalMaterialEvents > 0 ? (fallbackCount / totalMaterialEvents) * 100 : 0;

  logMetrics(
    [
      { name: 'DistilFinBERTFallbacks', value: fallbackCount, unit: MetricUnit.Count },
      { name: 'DistilFinBERTFallbackRate', value: fallbackRate, unit: MetricUnit.Percent },
    ],
    {
      Ticker: ticker,
      Service: 'DistilFinBERT',
      FallbackReason: reason,
    }
  );
}

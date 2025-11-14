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

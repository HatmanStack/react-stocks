# Monitoring and Metrics Guide

This document outlines the CloudWatch metrics and logging strategy for tracking infrastructure optimizations (Phase 1) and application performance.

## Custom Metrics

All metrics are logged using CloudWatch Embedded Metric Format (EMF) under the `ReactStocks` namespace.

### Optimization Metrics

| Metric Name | Unit | Dimensions | Description |
|-------------|------|------------|-------------|
| `ApiGatewayCacheHit` | Count | `Endpoint` | Number of requests served from API Gateway cache (inferred) |
| `ApiGatewayCacheMiss` | Count | `Endpoint` | Number of requests missed by API Gateway cache |
| `LambdaColdStart` | Count | `Endpoint` | Number of Lambda cold starts |
| `LambdaWarmStart` | Count | `Endpoint` | Number of Lambda warm starts |
| `DynamoDBCacheHit` | Count | `Ticker` | Number of successful cache lookups in DynamoDB |
| `DynamoDBCacheMiss` | Count | `Ticker` | Number of failed cache lookups (fetch from external API) |

### Performance Metrics

| Metric Name | Unit | Dimensions | Description |
|-------------|------|------------|-------------|
| `RequestDuration` | Milliseconds | `Endpoint` | Total duration of the Lambda execution |
| `TiingoAPILatency` | Milliseconds | `API`, `Endpoint` | Latency of calls to Tiingo API |
| `FinnhubAPILatency` | Milliseconds | `API`, `Endpoint` | Latency of calls to Finnhub API |

## CloudWatch Logs Insights Queries

### 1. Cache Hit Rate by Endpoint

Calculates the percentage of requests served from API Gateway cache (if visible) or DynamoDB cache.

```sql
filter @type = "REPORT"
| stats count(*) as TotalRequests,
        sum(ApiGatewayCacheHit) as CacheHits,
        (sum(ApiGatewayCacheHit) / count(*) * 100) as CacheHitRate
  by Endpoint
```

### 2. Cold Start Percentage

Tracks how often users experience cold starts.

```sql
filter @type = "REPORT"
| stats sum(LambdaColdStart) as ColdStarts,
        sum(LambdaWarmStart) as WarmStarts,
        (sum(LambdaColdStart) / (sum(LambdaColdStart) + sum(LambdaWarmStart)) * 100) as ColdStartPercentage
```

### 3. Average Lambda Duration by Endpoint

Helps identify slow endpoints needing optimization.

```sql
filter @type = "REPORT"
| stats avg(@duration) as AverageDuration,
        pct(@duration, 90) as p90Duration,
        max(@duration) as MaxDuration
  by Endpoint
```

### 4. DynamoDB Cache Efficiency

Tracks how effectively the application cache is reducing external API calls.

```sql
filter @type = "REPORT"
| stats sum(DynamoDBCacheHit) as DBHits,
        sum(DynamoDBCacheMiss) as DBMisses,
        (sum(DynamoDBCacheHit) / (sum(DynamoDBCacheHit) + sum(DynamoDBCacheMiss)) * 100) as DBHitRate
  by Ticker
```

## Creating a Dashboard

1. Go to CloudWatch > Dashboards > Create dashboard.
2. Name it `ReactStocks-Optimization`.
3. Add widgets using the queries above.
4. Set refresh interval to 5 minutes.

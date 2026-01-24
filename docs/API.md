# Backend API Reference

## Endpoints

All endpoints served via API Gateway v2 (HTTP API). Base URL stored in `frontend/.env` as `EXPO_PUBLIC_API_URL`.

### Python Lambda (yfinance)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/stocks` | Historical OHLCV price data |
| GET | `/search` | Symbol search |
| POST | `/batch/stocks` | Bulk price data for multiple tickers |

**GET /stocks** query params: `ticker`, `startDate`, `endDate`

**GET /search** query params: `query`

### Node.js Lambda (Finnhub + Sentiment)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/news` | Financial news articles |
| POST | `/sentiment` | Trigger sentiment analysis job |
| GET | `/sentiment` | Get cached sentiment results |
| GET | `/sentiment/job/{jobId}` | Poll job status |
| GET | `/sentiment/articles` | Get analyzed articles |
| POST | `/predict` | Server-side prediction (legacy) |
| POST | `/batch/news` | Bulk news for multiple tickers |
| POST | `/batch/sentiment` | Bulk sentiment for multiple tickers |

### Sentiment Job Flow

```
1. POST /sentiment {ticker, startDate, endDate}
   → Returns {jobId, status: "PENDING"}

2. GET /sentiment/job/{jobId}
   → Returns {status: "IN_PROGRESS"|"COMPLETED"|"FAILED", progress}

3. GET /sentiment?ticker=X&startDate=Y&endDate=Z
   → Returns aggregated daily sentiment array
```

## DynamoDB Tables

All tables use PAY_PER_REQUEST billing. Names prefixed with stack name.

### Cache Tables

| Table | PK | SK | TTL | Purpose |
|-------|----|----|-----|---------|
| StocksCache | ticker (S) | date (S) | ttl | Price data cache |
| NewsCache | ticker (S) | articleHash (S) | ttl | News article cache |
| SentimentCache | ticker (S) | articleHash (S) | ttl | Per-article sentiment + 3 signals |
| SentimentJobs | jobId (S) | - | ttl | Async job tracking |

### ML Data Tables

| Table | PK | SK | Purpose |
|-------|----|----|---------|
| StockHistoricalData | ticker (S) | date (S) | OHLCV for prediction training |
| ArticleAnalysisData | ticker (S) | articleHash (S) | Full article analysis results |
| DailySentimentAggregate | ticker (S) | date (S) | Aggregated daily signals |

### SentimentCache Item Schema

```typescript
{
  ticker: string,              // PK
  articleHash: string,         // SK
  sentiment: {
    positive: [count, confidence],
    negative: [count, confidence],
    neutral: [count, confidence],
    sentimentScore: number,    // -1 to +1
    classification: string     // POS|NEG|NEUT
  },
  eventType?: EventType,       // EARNINGS|M&A|GUIDANCE|ANALYST_RATING|PRODUCT_LAUNCH|GENERAL
  aspectScore?: number,        // -1 to +1
  aspectBreakdown?: {...},     // Per-aspect scores
  mlScore?: number,            // -1 to +1 (null for non-material)
  signalScore?: number,        // 0 to 1 (reliability weight)
  analyzedAt: number,          // Unix timestamp
  ttl: number                  // DynamoDB TTL
}
```

## Environment Variables

### Backend (Lambda)

| Variable | Required | Source |
|----------|----------|--------|
| FINNHUB_API_KEY | Yes | Finnhub API |
| ALPHA_VANTAGE_API_KEY | No | Alpha Vantage API |
| DISTILFINBERT_API_URL | No | ML sentiment endpoint |
| ALLOWED_ORIGINS | No | CORS origins (default: *) |

### Frontend

| Variable | Required | Source |
|----------|----------|--------|
| EXPO_PUBLIC_API_URL | Yes | API Gateway URL (set by deploy) |
| EXPO_PUBLIC_BROWSER_SENTIMENT | No | Enable browser sentiment |
| EXPO_PUBLIC_BROWSER_PREDICTION | No | Enable browser predictions |
| EXPO_PUBLIC_USE_LAMBDA_SENTIMENT | No | Use Lambda for sentiment |

## Monitoring

CloudWatch metrics under `ReactStocks` namespace:

| Metric | Dimensions | Unit |
|--------|------------|------|
| LambdaColdStart | Endpoint | Count |
| LambdaWarmStart | Endpoint | Count |
| DynamoDBCacheHit | Endpoint, Ticker | Count |
| DynamoDBCacheMiss | Endpoint, Ticker | Count |
| RequestDuration | Endpoint | Milliseconds |

CloudWatch Logs Insights query for cache hit rate:
```
fields @timestamp, @message
| filter @message like /CacheHit|CacheMiss/
| stats count() as total, sum(CacheHit) as hits by bin(1h)
```

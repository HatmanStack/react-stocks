# React Stocks Backend

AWS Lambda backend for React Stocks application. Provides secure API proxying for Tiingo (stock prices) and Polygon (news) APIs, protecting API keys from client-side exposure.

## Architecture

- **Runtime**: Node.js 20.x
- **Language**: TypeScript 5.x
- **Infrastructure**: AWS Lambda + API Gateway HTTP API + DynamoDB (caching)
- **Deployment**: AWS SAM CLI
- **Caching**: Three-tier lookup pattern (DynamoDB → External API → Cache result)

## Project Structure

```
backend/
├── src/
│   ├── handlers/          # Route handlers (stocks, news)
│   ├── services/          # API clients (Tiingo, Finnhub)
│   ├── repositories/      # DynamoDB cache repositories
│   ├── utils/             # Helper functions (caching, hashing, DynamoDB)
│   ├── types/             # TypeScript type definitions
│   └── index.ts           # Lambda entry point
├── __tests__/             # Unit and integration tests
├── template.yaml          # SAM CloudFormation template (includes DynamoDB tables)
├── samconfig.toml         # SAM deployment configuration
└── package.json
```

## Development

### Prerequisites

- Node.js 18+ (project uses v24 LTS)
- AWS CLI configured with credentials
- AWS SAM CLI (v1.70.0+)

Run prerequisite validation:
```bash
cd ..
npm run validate
```

### Installation

```bash
npm install
```

### Build

```bash
npm run build          # Compile TypeScript to dist/
npm run build:watch    # Watch mode for development
```

### Testing

```bash
npm test               # Run tests once
npm run test:watch     # Watch mode
npm run test:coverage  # Generate coverage report
```

Coverage target: >80% for all metrics (branches, functions, lines, statements)

### Local Development

```bash
# Build and start local API
sam build
sam local start-api

# Test locally
curl "http://localhost:3000/stocks?ticker=AAPL&startDate=2024-01-01&type=metadata"
```

### Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## API Endpoints

After deployment via SAM, the API Gateway provides:

### `GET /stocks` - Stock prices and metadata with caching

**Query Parameters:**
- `ticker` (required) - Stock ticker symbol (e.g., AAPL)
- `startDate` (required for prices) - Start date in YYYY-MM-DD format
- `endDate` (optional) - End date in YYYY-MM-DD format (defaults to today)
- `type` (optional) - `prices` (default) or `metadata`

**Response Format:**
```json
{
  "data": [...], // Stock price data or metadata
  "_meta": {
    "cached": true,          // Whether data was served from cache
    "cacheHitRate": 1.0,     // Percentage of dates found in cache (prices only)
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

**Caching Behavior:**
- **Cache TTL**: 7 days
- **Cache check**: DynamoDB queried first for requested date range
- **Cache hit threshold**: >80% of dates must be cached to use cache
- **Fallback**: Fetches from Tiingo API if cache miss or insufficient coverage
- **Auto-caching**: All API responses automatically cached for future requests

**Example:**
```bash
# First request (cache miss)
curl "https://api.example.com/stocks?ticker=AAPL&startDate=2025-01-01&endDate=2025-01-30"
# Response: _meta.cached = false

# Second request (cache hit)
curl "https://api.example.com/stocks?ticker=AAPL&startDate=2025-01-01&endDate=2025-01-30"
# Response: _meta.cached = true, _meta.cacheHitRate = 1.0
```

### `GET /news` - News articles with caching and deduplication

**Query Parameters:**
- `ticker` (required) - Stock ticker symbol
- `from` (required) - Start date in YYYY-MM-DD format
- `to` (required) - End date in YYYY-MM-DD format

**Response Format:**
```json
{
  "data": [...], // News articles
  "_meta": {
    "cached": true,           // Whether all articles were from cache
    "newArticles": 5,         // Number of new articles cached this request
    "cachedArticles": 15,     // Number of articles already in cache
    "timestamp": "2025-01-15T12:00:00.000Z"
  }
}
```

**Caching Behavior:**
- **Cache TTL**: 30 days
- **Deduplication**: Articles identified by SHA-256 hash of URL (first 16 chars)
- **Cache hit threshold**: ≥10 articles in cache for date range triggers cache use
- **Duplicate filtering**: API responses filtered to prevent caching duplicates
- **Auto-caching**: Only new articles (not already cached) are stored

**Example:**
```bash
# First request (cache miss, fetches from Finnhub)
curl "https://api.example.com/news?ticker=AAPL&from=2025-01-01&to=2025-01-30"
# Response: _meta.cached = false, _meta.newArticles = 20

# Second request (cache hit)
curl "https://api.example.com/news?ticker=AAPL&from=2025-01-01&to=2025-01-30"
# Response: _meta.cached = true, _meta.cachedArticles = 20
```

## Environment Variables

Required for Lambda deployment:

- `TIINGO_API_KEY` - Tiingo API key (for stock prices)
- `FINNHUB_API_KEY` - Finnhub API key (for news articles)
- `STOCKS_CACHE_TABLE` - DynamoDB table name for stock prices cache (auto-configured)
- `NEWS_CACHE_TABLE` - DynamoDB table name for news articles cache (auto-configured)
- `SENTIMENT_CACHE_TABLE` - DynamoDB table name for sentiment analysis cache (auto-configured)
- `SENTIMENT_JOBS_TABLE` - DynamoDB table name for sentiment job tracking (auto-configured)

API keys are configured via SAM template parameters during deployment. DynamoDB table names are automatically configured by SAM template.

## Scripts

- `npm run build` - Compile TypeScript to JavaScript
- `npm test` - Run test suite
- `npm run clean` - Remove build artifacts

## Security

- API keys stored as encrypted Lambda environment variables
- CORS enabled for frontend origins
- Input validation on all routes
- IAM permissions: CloudWatch Logs + DynamoDB read/write (scoped to cache tables only)
- DynamoDB TTL auto-deletes stale data (7-90 days depending on table)

## DynamoDB Cache Tables

| Table | Purpose | PK | SK | TTL | Notes |
|-------|---------|----|----|-----|-------|
| `StocksCache` | Stock price data | ticker | date | 7 days | OHLCV data + metadata |
| `NewsCache` | News articles | ticker | articleHash | 30 days | Deduplicated by URL hash |
| `SentimentCache` | Sentiment analysis | ticker | articleHash | 90 days | Sentiment scores per article |
| `SentimentJobs` | Async job tracking | jobId | - | 24 hours | Sentiment processing status |

**Cache Strategy:**
- **Three-tier lookup**: Local cache → DynamoDB → External API → Cache result
- **Auto-caching**: All API responses automatically cached for future use
- **Graceful degradation**: Falls back to API if cache unavailable
- **Cost control**: TTL auto-deletes old data to prevent unbounded growth

## License

MIT

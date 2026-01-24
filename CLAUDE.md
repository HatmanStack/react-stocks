# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Root monorepo commands
npm install --legacy-peer-deps  # Install all dependencies
npm test                         # Run frontend tests
npm run test:backend             # Run backend tests
npm run lint                     # Lint frontend (expo lint + tsc)
npm run lint:backend             # Lint backend TypeScript
npm run lint:ml                  # Lint Python ML code (ruff)
npm run check                    # Full CI check (all lint + all tests)
npm run hygiene                  # Dead code detection (knip + vulture)

# Frontend (cd frontend)
npm start                        # Expo dev server
npm run android                  # Run on Android
npm run ios                      # Run on iOS
npm run web                      # Run on web browser
npm run test:watch               # TDD mode
npm run test:coverage            # Coverage report

# Backend (cd backend)
npm run build                    # Build with esbuild
npm run type-check               # TypeScript check
npm run test:integration         # Integration tests
npm run deploy                   # Deploy via SAM
npm run logs                     # View Lambda logs
npm run warm-cache               # Pre-populate DynamoDB cache
```

### Running Single Tests

```bash
# Frontend - run single test file
npm test -- frontend/src/hooks/__tests__/useChartData.test.ts

# Backend - run single test file
cd backend && npm test -- --testPathPattern=sentiment

# Python tests
PYTHONPATH=backend/python pytest backend/python_tests/ -k "test_name"
```

## Architecture Overview

**Monorepo Structure**: npm workspaces with `frontend/` (Expo/React Native) and `backend/` (AWS Lambda).

### Frontend Architecture (Expo Router + React Native Paper)

```text
frontend/
├── app/(tabs)/          # File-based routing (Expo Router)
│   ├── index.tsx        # Market overview screen
│   ├── portfolio.tsx    # Watchlist screen
│   └── stock/           # Stock detail screens
├── src/
│   ├── contexts/        # React Context providers (StockContext, StockDetailContext)
│   ├── hooks/           # Custom hooks (useStockData, usePortfolio, useSentimentData)
│   ├── services/api/    # API client layer
│   ├── database/        # Platform abstraction (SQLite native, localStorage web)
│   │   ├── database.ts      # Native SQLite implementation
│   │   ├── database.web.ts  # Web localStorage implementation
│   │   └── repositories/    # Repository pattern for data access
│   ├── ml/              # Browser-side ML (sentiment analysis, predictions)
│   └── components/      # Reusable UI components
```

**Key Patterns**:
- **Platform Abstraction**: `database.ts` vs `database.web.ts` - bundler resolves `.web.ts` for web builds
- **Repository Pattern**: All data access through `src/database/repositories/`
- **TanStack Query**: Used for API caching and data synchronization
- **Path Aliases**: `@/` maps to `src/` (configured in tsconfig.json)

### Backend Architecture (AWS SAM + Lambda)

```text
backend/
├── src/                 # Node.js Lambda (news, sentiment, predict endpoints)
│   ├── handlers/        # Route handlers
│   ├── services/        # Business logic
│   ├── repositories/    # DynamoDB data access
│   └── ml/              # Server-side ML components
├── python/              # Python Lambda (stocks, search endpoints via yfinance)
│   ├── handlers/
│   ├── services/
│   └── repositories/
└── template.yaml        # SAM CloudFormation template
```

**API Endpoints** (defined in `template.yaml`):
- `GET /stocks` - Stock price data (Python/yfinance)
- `GET /search` - Symbol search (Python)
- `GET /news` - Financial news (Node.js/Finnhub)
- `POST /sentiment` - Sentiment analysis job
- `GET /sentiment/job/{jobId}` - Poll sentiment job status
- `POST /predict` - ML prediction endpoint
- `POST /batch/*` - Batch endpoints for bulk operations

**DynamoDB Tables** (7 tables, all PAY_PER_REQUEST):
- `*-StocksCache`, `*-NewsCache`, `*-SentimentCache` - TTL-based caching
- `*-SentimentJobs` - Async job tracking
- `*-StockHistoricalData`, `*-ArticleAnalysisData`, `*-DailySentimentAggregate` - ML training data

### Multi-Language Lambda Setup

The backend uses two Lambda functions:
1. **Node.js** (`ReactStocksFunction`): News, sentiment, prediction - built via esbuild
2. **Python** (`PythonStocksFunction`): Stock data, search - uses yfinance

Both share API Gateway and some DynamoDB tables.

## Testing Notes

- **Frontend tests**: Jest + React Native Testing Library, mocks in `frontend/__mocks__/`
- **Backend tests**: Jest with ESM support (`--experimental-vm-modules`)
- **Python tests**: pytest in `backend/python_tests/`
- **Coverage thresholds**: Frontend 30%, Backend 70%

## Environment Variables

Frontend `.env` (auto-updated by backend deploy):
```dotenv
EXPO_PUBLIC_API_URL=https://xxx.execute-api.region.amazonaws.com
```

Backend `.env.deploy`:
```dotenv
FINNHUB_API_KEY=your_key
ALLOWED_ORIGINS=*
```

## Code Quality Tools

- **knip**: TypeScript dead code detection
- **vulture**: Python dead code detection (whitelist in `backend/vulture_whitelist.py`)
- **ruff**: Python linting (use `uvx ruff check`)
- **ESLint**: TypeScript linting (via Expo config)

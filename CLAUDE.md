# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cross-platform stock tracking application built with React Native, Expo, and expo-router. Displays stock prices, news, and sentiment analysis. Supports iOS, Android, and Web with platform-specific database implementations.

## Development Commands

```bash
# Start development server
npm start              # Expo dev server (prompts for platform)
npm run web            # Web browser
npm run android        # Android emulator/device
npm run ios            # iOS simulator

# Testing
npm test               # Run all tests once
npm run test:watch     # Watch mode for TDD
npm run test:coverage  # Generate coverage report

# Code quality
npm run type-check     # TypeScript compilation check
npm run lint           # ESLint
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Prettier formatting

# Backend deployment (one-time setup)
cd backend
npm install                       # Install backend dependencies
npm run deploy:guided             # Build + deploy Lambda (auto-updates frontend .env)

# Backend development
cd backend
npm test                          # Run backend tests
npm run test:watch                # Watch mode for backend tests
npm run validate                  # Validate AWS prerequisites
npm run logs                      # View Lambda logs
npm run update-env                # Manually update frontend .env with API URL
```

## Environment Setup

**Required Environment Variables** (create `.env` from `.env.example`):

```bash
# Backend API Gateway URL (from Lambda deployment)
EXPO_PUBLIC_BACKEND_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com

# Feature Flags for ML Migration (Lambda-first)
EXPO_PUBLIC_USE_LAMBDA_SENTIMENT=true    # Use Lambda sentiment (recommended)
EXPO_PUBLIC_BROWSER_SENTIMENT=false      # Browser fallback for offline
EXPO_PUBLIC_BROWSER_PREDICTION=false     # Use browser-based prediction (test first)
```

**Setup Steps**:
1. Deploy backend: `cd backend && npm run deploy:guided`
2. Frontend `.env` is auto-updated with API Gateway URL
3. Optionally enable browser-based ML via feature flags in `.env`

**⚠️ Security**: API keys for Tiingo and Polygon are **never** stored in frontend code. They are configured as Lambda environment variables during backend deployment.

## Architecture Overview

### Layered Architecture

**Presentation** → **State Management** → **Business Logic** → **Data Access** → **External Services**

1. **Presentation Layer**: Expo Router screens in `app/`, components in `src/components/`
2. **State Management**: React Context (global state) + React Query (server/DB cache)
3. **Business Logic**: Custom hooks in `src/hooks/`
4. **Data Access**: Repository pattern in `src/database/repositories/`
5. **External Services**: API clients in `src/services/api/`

### Key Design Patterns

- **Repository Pattern**: All database operations abstracted through repositories
- **Platform Abstraction**: Dual database implementation (SQLite for native, localStorage for web)
- **Service Layer**: External API calls isolated in dedicated service modules
- **Hook Composition**: Data fetching and business logic encapsulated in custom hooks
- **Provider Pattern**: React Context for global state (StockContext, PortfolioContext)

## Navigation Structure (Expo Router)

File-based routing with bottom tabs and nested material top tabs:

```
app/
  _layout.tsx                     # Root: Providers, ErrorBoundary, database init
  (tabs)/
    _layout.tsx                   # Bottom tabs: Search | Portfolio
    index.tsx                     # / - Search screen (default)
    portfolio.tsx                 # /portfolio - Portfolio screen
    stock/[ticker]/               # Dynamic stock routes
      _layout.tsx                 # Stock header + Material Top Tabs
      index.tsx                   # /stock/AAPL - Price tab (default)
      sentiment.tsx               # /stock/AAPL/sentiment
      news.tsx                    # /stock/AAPL/news
```

**Navigation Notes**:
- Stock tab hidden from bottom tabs (`href: null`) - accessed via `router.push('/(tabs)/stock/AAPL')`
- Deep linking configured: `stockapp://stock/AAPL` or `https://stocks.app/stock/AAPL`
- Navigation state persisted in AsyncStorage under `@navigation_state`

## Database Architecture

### Platform-Specific Implementation

**Critical**: The app uses different database implementations per platform:

- **Native (iOS/Android)**: `src/database/database.ts` - Uses expo-sqlite (actual SQLite)
- **Web**: `src/database/database.web.ts` - Uses localStorage with SQL-like interface
- **Platform selection**: `src/database/index.ts` dynamically imports based on `Platform.OS`

**Schema** (6 tables):
1. `stock_details` - OHLCV price data, financial ratios
2. `symbol_details` - Company metadata (name, description, exchange)
3. `news_details` - News articles per ticker
4. `word_count_details` - Per-article sentiment analysis
5. `combined_word_count_details` - Daily aggregated sentiment
6. `portfolio_details` - User's watchlist with predictions

**All repositories in `src/database/repositories/` work with both implementations transparently.**

### Web Database Implementation

The web version (`database.web.ts`) stores data as JSON in localStorage under `stocks_data`:

```typescript
{
  symbols: { AAPL: {...}, GOOGL: {...} },
  stocks: { AAPL: [{date, open, high, low, close, volume}, ...] },
  news: { AAPL: [{hash, articleUrl, articleDate, ...}, ...] },
  sentiment: { AAPL: [{date, positiveScore, negativeScore, ...}, ...] },
  articleSentiment: { AAPL: [{hash, date, positiveScore, ...}, ...] },
  portfolio: { AAPL: {ticker, name, addedAt}, ... }
}
```

Parses SQL-like queries to simulate database operations. No actual SQL on web.

## Data Flow and State Management

### State Management Strategy

**React Query** (server/DB cache):
- 5-minute stale time, 3 retries with exponential backoff
- Used in all data hooks: `useStockData`, `useNewsData`, `useSentimentData`, etc.
- Query keys: `['stockData', ticker, days]`, `['newsData', ticker, days]`, `['portfolio']`

**React Context** (global UI state):
- `StockContext` - Selected ticker, date range (start/end)
- `PortfolioContext` - Portfolio items, CRUD operations

### Data Flow Pattern

```
User Action → Custom Hook (useStockData)
    ↓
React Query checks cache → Valid? Return cached data
    ↓ (cache miss/stale)
Repository.findByTicker(ticker) → Database query
    ↓
Data exists? Return from DB
    ↓ (missing data)
Trigger sync (syncOrchestrator) → API calls → Store in DB
    ↓
Re-fetch from DB → Update React Query cache → UI updates
```

### Sync Pipeline (syncOrchestrator.ts)

Orchestrates full data sync in sequence:

1. **Stock Prices**: Lambda Backend → `stock_details` table
2. **News Articles**: Lambda Backend → `news_details` table
3. **Sentiment Analysis**: Browser-based ML → `word_count_details` + `combined_word_count_details`
4. **Predictions**: Browser-based ML → `portfolio_details`

Each step:
- Fetches from backend or runs ML locally
- Stores in database via repository
- Reports progress via callback
- Logs errors but continues pipeline

**Critical**: Sync is triggered from search/portfolio screens when selecting a ticker. Data is pulled into database, then hooks re-fetch from DB.

## External APIs & Services

### Backend Lambda API (AWS)

**Primary data source** for stock prices and news:

- **Base URL**: Set via `EXPO_PUBLIC_BACKEND_URL` environment variable
- **Endpoints**:
  - `/stocks?ticker={TICKER}&startDate={DATE}&type=prices` - Stock price data (proxies Tiingo)
  - `/stocks?ticker={TICKER}&type=metadata` - Company metadata (proxies Tiingo)
  - `/news?ticker={TICKER}&limit={N}` - News articles (proxies Polygon, handles pagination)
- **Security**: API keys for Tiingo/Polygon stored in Lambda environment variables (not in frontend)
- **Rate limiting**: Handled by Lambda backend
- **Timeout**: 30s (backend handles retries)
- **Implementation**: `src/services/api/tiingo.service.ts`, `src/services/api/polygon.service.ts`
- **Backend source**: `backend/` directory (AWS SAM template)

### Sentiment Analysis (Lambda-based - Primary)

**Lambda Sentiment Processing** (Primary method):
- **Type**: Asynchronous Lambda-based sentiment analysis
- **Implementation**: `backend/src/services/sentimentProcessing.service.ts`
- **Feature Flag**: `EXPO_PUBLIC_USE_LAMBDA_SENTIMENT` (default: true)
- **Caching**: Results cached in DynamoDB for cross-user sharing
- **Performance**: <15s for 30-day range (vs 45s+ browser-based)
- **Frontend Integration**: `src/services/api/lambdaSentiment.service.ts`
- **Polling**: Frontend polls Lambda job status asynchronously

**Browser-Based Sentiment** (Deprecated - Offline Fallback Only):
- **Type**: JavaScript rule-based sentiment analyzer
- **Implementation**: `src/ml/sentiment/sentiment.service.ts` (deprecated)
- **Status**: ⚠️ **Deprecated** - Will be removed in v2.0
- **Usage**: Fallback only when Lambda unavailable (offline mode)
- **Performance**: <100ms per article but blocks UI for sequential processing
- **Lexicon**: Financial-specific word list in `src/data/sentiment-words.json`

**Stock Predictions**:
- **Type**: Logistic regression (ported from Python scikit-learn)
- **Implementation**: `src/ml/prediction/model.ts`, `src/ml/prediction/scaler.ts`
- **Features**: Price ratios, sentiment scores, technical indicators (volume, volatility)
- **Targets**: Next day, next week, next month predictions
- **Feature Flag**: `EXPO_PUBLIC_BROWSER_PREDICTION` (default: false, enable after testing)
- **Fallback**: Python microservice (deprecated, for rollback only)
- **Performance**: <50ms per prediction (runs in browser)
- **Accuracy**: Identical to Python implementation (numerical precision to 4 decimals)

### Python Microservices (DEPRECATED - For Rollback Only)

**⚠️ Note**: These services are deprecated and will be decommissioned in Phase 5. Use feature flags to enable browser-based ML instead.

**Sentiment Service**:
- Endpoint: `https://stocks-backend-sentiment-f3jmjyxrpq-uc.a.run.app/sentiment`
- Model: FinBERT (financial sentiment analysis)
- Fallback: Only if `EXPO_PUBLIC_BROWSER_SENTIMENT=false`

**Prediction Service**:
- Endpoint: `https://stocks-f3jmjyxrpq-uc.a.run.app/predict`
- Model: Logistic regression (scikit-learn)
- Fallback: Only if `EXPO_PUBLIC_BROWSER_PREDICTION=false`

## Testing Conventions

### File Structure

Tests mirror `src/` structure in `__tests__/`:

```
__tests__/
  database/
    repositories/*.test.ts        # One test file per repository
  services/
    api/*.test.ts                 # API service tests
  utils/                          # Utility tests (date, formatting, validation)
  integration/                    # End-to-end flows
```

### Running Specific Tests

```bash
# Run a specific test file
npm test -- __tests__/database/repositories/symbol.repository.test.ts

# Run tests matching a pattern
npm test -- --testNamePattern="should find symbol by ticker"

# Watch specific directory
npm run test:watch -- __tests__/services/api

# Run only unit tests (exclude integration tests)
npm test -- --testPathIgnorePatterns=integration
```

### Mocking Patterns

- **Service mocks**: `src/services/__mocks__/polygon.mock.ts` (mock API responses)
- **Module mocks**: `__mocks__/expo-sqlite.ts` (mock native modules)
- **Test data**: Use factories in `src/utils/mockData/` for consistent test fixtures

## Important Patterns and Conventions

### Platform-Specific Code

Use dynamic imports based on `Platform.OS`:

```typescript
if (Platform.OS === 'web') {
  const { initializeDatabase } = await import('../src/database/database.web');
} else {
  const { initializeDatabase } = await import('../src/database/database');
}
```

### Error Handling

- Custom `APIError` class with HTTP status codes
- Repository errors logged with pattern: `console.error('[RepositoryName] Error:', error)`
- ErrorBoundary wraps entire app in `app/_layout.tsx`
- Sync errors logged but don't stop pipeline (fail gracefully)

### Date Formatting

- **Database storage**: ISO 8601 (`YYYY-MM-DD`)
- **Utility**: `formatDateForDB(date)` ensures consistency
- **Display**: `format(date, 'MMM dd, yyyy')` via `date-fns`

### TypeScript Conventions

- All database types: `src/types/database.types.ts`
- API response types: Service-specific (e.g., `tiingo.types.ts`)
- Use `Omit<Type, 'id'>` for insert operations (auto-generated IDs)

### React Query Usage

```typescript
// In custom hooks
const { data, isLoading, error } = useQuery({
  queryKey: ['stockData', ticker, days],
  queryFn: () => repository.findByTicker(ticker),
  staleTime: 1000 * 60 * 5, // 5 minutes
  retry: 3,
});
```

### Repository Pattern

All repositories follow consistent interface:

```typescript
// Insert/upsert
async function insert(data: Omit<Entity, 'id'>): Promise<void>

// Query
async function findByTicker(ticker: string): Promise<Entity[]>
async function findAll(): Promise<Entity[]>

// Delete
async function deleteByTicker(ticker: string): Promise<void>
```

Use transactions for multi-row operations:

```typescript
await db.withTransactionAsync(async () => {
  for (const item of items) {
    await repository.insert(item);
  }
});
```

## Common Development Scenarios

### Adding a New Data Type

1. **Define schema** in `src/database/schema.ts`:
   ```typescript
   export const CREATE_MY_TABLE = `CREATE TABLE IF NOT EXISTS my_table (...)`
   ```

2. **Create type** in `src/types/database.types.ts`:
   ```typescript
   export interface MyDetails { ticker: string; data: string; }
   ```

3. **Create repository** in `src/database/repositories/my.repository.ts`:
   ```typescript
   export async function insert(data: MyDetails) { ... }
   export async function findByTicker(ticker: string) { ... }
   ```

4. **Update web database** in `src/database/database.web.ts`:
   - Add storage key to `StorageData` interface
   - Add insert/query methods

5. **Create API service** in `src/services/api/my.service.ts`:
   ```typescript
   export async function fetchMyData(ticker: string) { ... }
   ```

6. **Create sync service** in `src/services/sync/myDataSync.ts`:
   ```typescript
   export async function syncMyData(ticker, days) {
     const data = await fetchMyData(ticker);
     await repository.insert(data);
   }
   ```

7. **Create hook** in `src/hooks/useMyData.ts`:
   ```typescript
   export function useMyData(ticker: string) {
     return useQuery({
       queryKey: ['myData', ticker],
       queryFn: () => repository.findByTicker(ticker),
     });
   }
   ```

### Debugging Database Issues

**Native (SQLite)**:
- Enable logging in repositories (already present): `console.log('[RepoName] Query:', sql)`
- Check table existence: `SELECT name FROM sqlite_master WHERE type='table'`
- Inspect with Expo dev tools: Database tab shows SQLite contents

**Web (localStorage)**:
- Open browser DevTools → Application → Local Storage
- Key: `stocks_data`
- JSON structure visible, manually editable
- Clear: `localStorage.removeItem('stocks_data')`

### Navigation Between Screens

```typescript
// From anywhere in the app
import { router } from 'expo-router';

// Navigate to stock detail
router.push('/(tabs)/stock/AAPL');

// Navigate to specific tab within stock
router.push('/(tabs)/stock/AAPL/sentiment');

// Go back
router.back();

// Replace (no back history)
router.replace('/(tabs)/portfolio');
```

### Platform-Specific UI Components

Material Design via React Native Paper (already integrated):

```typescript
import { Button, Text, Card } from 'react-native-paper';

// Components automatically adapt to platform (iOS/Android/Web)
<Button mode="contained" onPress={...}>Click Me</Button>
```

### Accessing Global State

```typescript
// In any component/hook
import { useStock } from '@/contexts/StockContext';
import { usePortfolioContext } from '@/contexts/PortfolioContext';

function MyComponent() {
  const { selectedTicker, setSelectedTicker, startDate, endDate, setDateRange } = useStock();
  const { portfolio, addToPortfolio, removeFromPortfolio } = usePortfolioContext();

  // Use state...
}
```

## Path Aliases

TypeScript configured with path aliases (tsconfig.json):

```typescript
import { formatDateForDB } from '@/utils/date/dateUtils';
import { StockMetadataCard } from '@/components/stock/StockMetadataCard';
import { useStockData } from '@/hooks/useStockData';
import type { StockDetails } from '@/types/database.types';
```

Available aliases: `@/*` maps to `src/*` (all subdirectories auto-resolved)

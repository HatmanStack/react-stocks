# Code Hygiene Audit Report

Generated: 2026-01-08

## Executive Summary

| Category | Count | Severity |
|----------|-------|----------|
| Unused Dependencies | 24 | HIGH |
| Unused Exports | 120 | MEDIUM |
| Unused Types | 29 | LOW |
| Unused Enum Members | 23 | LOW |
| Console Statements | 424 | MEDIUM |
| Python Dead Code | 38 items | MEDIUM |
| Unresolved Imports | 20 | HIGH |
| Hardcoded Secrets | 0 | OK |

## Priority Actions

### 1. Remove Unused Dependencies (HIGH)

**Root package.json** - Remove these (they're workspace deps, not root deps):
```
babel-preset-expo, expo-constants, expo-haptics, expo-linking,
expo-router, expo-secure-store, expo-status-bar,
react-native-gesture-handler, react-native-svg, react-native-worklets
```

**backend/package.json**:
- `@aws-sdk/client-lambda` - unused

**frontend/package.json**:
- `@react-native-async-storage/async-storage`
- `@react-navigation/bottom-tabs`
- `@react-navigation/stack`
- `@types/xml2js`
- `expo-secure-store`
- `react-native-tab-view`
- `xml2js`

### 2. Fix Unresolved Imports (HIGH)

Test files have broken imports. Fix or delete:
```
tests/frontend/database/database.test.ts
tests/frontend/database/repositories/*.test.ts
tests/frontend/integration/predictionFlow.test.ts
tests/frontend/services/sync/sentimentDataSync.test.ts
tests/frontend/utils/formatting/*.test.ts
tests/frontend/utils/sentiment/*.test.ts
```

### 3. Dead Exports to Remove (MEDIUM)

**backend/src/repositories/index.ts** - Remove barrel exports:
```typescript
// DELETE these re-exports (unused):
StocksCacheRepository, NewsCacheRepository,
SentimentCacheRepository, SentimentJobsRepository
```

**backend/src/utils/cache.util.ts** - Remove:
```typescript
isCacheFresh, generateCacheKey, parseCacheKey
```

**backend/src/utils/metrics.util.ts** - Remove unused MetricUnit members:
```typescript
// Keep only: Count, Milliseconds
// DELETE: Seconds, Microseconds, Bytes, Kilobytes, Megabytes, Gigabytes,
//         Terabytes, Bits, Kilobits, Megabits, Gigabits, Terabits,
//         BytesPerSecond, KilobytesPerSecond, MegabytesPerSecond,
//         GigabytesPerSecond, TerabytesPerSecond, BitsPerSecond,
//         KilobitsPerSecond, MegabitsPerSecond, GigabitsPerSecond,
//         TerabitsPerSecond, CountPerSecond
```

**frontend/src/components/common/index.ts** - Remove unused barrel exports:
```typescript
// DELETE: StockCard, SentimentChip, LoadingIndicator, ErrorDisplay,
//         EmptyState, ContentContainer
```

**frontend/src/database/schema.ts** - Remove unused SQL constants:
```typescript
// DELETE all CREATE_*_TABLE and MIGRATE_* exports if only used internally
```

**frontend/src/utils/** - Large number of unused utility functions:
- `frontend/src/utils/date/dateUtils.ts` - 9 unused exports
- `frontend/src/utils/formatting/numberFormatting.ts` - 3 unused exports
- `frontend/src/utils/sentiment/*.ts` - 8 unused exports

### 4. Python Dead Code (MEDIUM)

**backend/python/handlers/stocks.py:25**
- `generate_date_range` - unused function, DELETE

**backend/python/repositories/stocks_cache.py**
- Line 31: `BATCH_SIZE` - unused constant
- Line 84: `get_stock` - unused function
- Line 106: `put_stock` - unused function
- Line 131: `batch_get_stocks` - unused function

**backend/python/schemas/stock_types.py**
- `TiingoStockPrice` class - unused (lines 8-23)
- `TiingoSymbolMetadata` class - unused (lines 26-34)
- `TiingoSearchResult` class - unused (lines 37-43)

**backend/python/services/yfinance_service.py:29**
- `_get_pandas` - unused function

**backend/services/ml/app.py** - False positives (FastAPI routes appear unused to vulture)
- Add to `backend/vulture_whitelist.py`:
```python
analyze_text_sentiment
analyze_batch_sentiment
health_check
root
global_exception_handler
```

### 5. Console Statement Cleanup (MEDIUM)

424 console statements across 54 files. Key files to clean:
- `backend/src/services/sentimentProcessing.service.ts` - 14 statements
- `backend/src/handlers/sentiment.handler.ts` - 14 statements
- `frontend/src/ml/prediction/prediction.service.ts` - 17 statements
- `frontend/src/services/sync/*.ts` - 29 statements total

**Recommendation**: Replace with structured logger or remove entirely.

## Files Safe to Delete

```
# Test files with broken imports (unusable)
tests/frontend/database/
tests/frontend/utils/formatting/
tests/frontend/utils/sentiment/
tests/frontend/services/sync/sentimentDataSync.test.ts
tests/frontend/integration/predictionFlow.test.ts

# Unused schema constants (if confirmed internal-only)
# Review frontend/src/database/schema.ts exports
```

## Knip Configuration Fixes

Update `knip.json`:
```json
{
  "workspaces": {
    "frontend": {
      "entry": ["app/**/*.tsx", "src/hooks/*.ts", "src/contexts/*.tsx"],
      "project": ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
      "ignore": ["**/__tests__/**", "**/*.test.{ts,tsx}"]
    },
    "backend": {
      "entry": ["src/index.ts", "scripts/*.ts"],
      "project": ["src/**/*.ts"],
      "ignore": ["**/__tests__/**", "**/*.test.ts"]
    }
  },
  "ignoreDependencies": []
}
```

## CI/CD Notes

Current `.github/workflows/ci.yml` is well-structured:
- Uses Node 24 and Python 3.13 (correct)
- Parallel lint and test jobs (correct)
- Status check gate (correct)

Minor improvement: Add `--max-warnings=0` to ESLint for stricter enforcement.

## Commands to Run

```bash
# Remove unused dependencies
npm uninstall babel-preset-expo expo-constants expo-haptics expo-linking expo-router expo-secure-store expo-status-bar react-native-gesture-handler react-native-svg react-native-worklets

cd frontend && npm uninstall @react-native-async-storage/async-storage @react-navigation/bottom-tabs @react-navigation/stack @types/xml2js expo-secure-store react-native-tab-view xml2js

cd backend && npm uninstall @aws-sdk/client-lambda

# Run hygiene script
./scripts/code-hygiene.sh --fix

# Verify
npm run check
```

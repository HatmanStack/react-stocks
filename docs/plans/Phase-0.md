# Phase 0: Foundation

## Phase Goal

Establish architecture decisions, design patterns, and infrastructure requirements for migrating from Tiingo to yfinance. This phase defines the "law" that all implementation phases follow.

**Success Criteria:**
- All architecture decisions documented
- Testing strategy defined
- Deployment script specifications complete

**Estimated Tokens:** ~15,000

## Prerequisites

- Access to AWS account with existing deployment
- Understanding of current Tiingo integration (see exploration notes below)

## Architecture Decisions (ADRs)

### ADR-1: Python Lambda for yfinance

**Decision:** Create a new Python 3.13 Lambda function to handle stock-related endpoints using yfinance.

**Context:** yfinance is a Python library with no Node.js equivalent. The current backend is Node.js.

**Options Considered:**
1. Chain Lambdas (Node.js → Python) - Rejected: adds latency, complexity
2. Convert entire backend to Python - Rejected: too much scope creep
3. Replace Node.js stock handlers with Python Lambda - **Selected**

**Rationale:** Direct replacement minimizes latency. The Python Lambda handles stock routes; Node.js Lambda continues handling news, sentiment, and prediction routes.

**Consequences:**
- Two Lambda functions in the stack (Python for stocks, Node.js for other routes)
- Separate routing at API Gateway level
- Independent scaling for stock vs. other endpoints

### ADR-2: Response Format Compatibility

**Decision:** Python Lambda transforms yfinance data to match existing Tiingo response format exactly.

**Context:** Frontend expects specific field names and structures.

**Rationale:** Zero frontend changes required. Transformation happens server-side in Python.

**Field Mappings:**

| Tiingo Field | yfinance Source |
|--------------|-----------------|
| `date` | DataFrame index (datetime → ISO string) |
| `open`, `high`, `low`, `close` | Same names |
| `volume` | Same name |
| `adjOpen`, `adjHigh`, `adjLow` | Derived from close ratio or set to OHLC values |
| `adjClose` | yfinance `Adj Close` column |
| `adjVolume` | Same as volume (yfinance doesn't provide) |
| `divCash` | `Dividends` column or 0 |
| `splitFactor` | `Stock Splits` column or 1 |

| Tiingo Metadata | yfinance Source |
|-----------------|-----------------|
| `ticker` | Input ticker |
| `name` | `info['shortName']` or `info['longName']` |
| `exchangeCode` | `info['exchange']` |
| `description` | `info['longBusinessSummary']` |
| `startDate` | Not available (omit or use empty string) |
| `endDate` | Not available (omit or use empty string) |

| Tiingo Search | yfinance Source |
|---------------|-----------------|
| `ticker` | `symbol` |
| `name` | `shortname` |
| `assetType` | `quoteType` |
| `isActive` | Not available (omit or default `true`) |

### ADR-3: Simplified Caching Strategy

**Decision:** Keep basic DynamoDB caching, remove cache warming.

**Context:** Current implementation has:
- 3-tier cache with 80% hit rate threshold
- Scheduled cache warming (9 AM ET Mon-Fri)
- TopTickersCacheTable for warming targets

**Changes:**
- Keep StocksCacheTable with same schema
- Keep cache check/store logic in handlers
- Remove CacheWarmingFunction Lambda
- Remove TopTickersCacheTable (only used by cache warming)
- Remove cache warming scripts

**Decision on TopTickersCacheTable:** Remove it. This table is only used by CacheWarmingFunction to store popular ticker lists. Since we're removing cache warming entirely, keeping this table would be dead infrastructure.

**Rationale:** Cache warming was optimizing for Tiingo API limits. yfinance has no API key or rate limits (uses Yahoo Finance public data). Simpler architecture, fewer moving parts.

### ADR-4: Lambda Runtime Strategy

**Decision:** Use Python 3.13 with standard `python3.13` runtime. SAM handles dependency bundling automatically.

**Context:** yfinance has dependencies (pandas, numpy) but total package size fits within Lambda's 250MB limit.

**Approach:**
1. Define `requirements.txt` in Python code directory
2. SAM builds and packages dependencies automatically
3. No layers or containers needed

**Dependencies (in requirements.txt):**
- yfinance
- pandas
- boto3 (explicit version for consistency)

**Note:** `requests` is a transitive dependency of yfinance, so it's available for the Yahoo Finance search API without explicit declaration.

### ADR-5: API Gateway Routing

**Decision:** Route stock endpoints to Python Lambda, other endpoints to existing Node.js Lambda.

**Routes to Python Lambda:**
- `GET /stocks` → Stock prices and metadata
- `GET /search` → Ticker search
- `POST /batch/stocks` → Batch stock prices

**Routes remaining on Node.js Lambda:**
- `GET /news` → Finnhub news
- `POST /batch/news` → Batch news
- `GET /sentiment`, `POST /sentiment`, etc. → Sentiment analysis
- `POST /predict` → ML predictions

---

## Tech Stack

### Python Lambda
- **Runtime:** Python 3.13
- **Framework:** Standard Lambda handler (no framework needed)
- **Data Provider:** yfinance library
- **Database:** boto3 + DynamoDB (existing tables)
- **Logging:** Python logging module

### Existing Node.js Lambda (unchanged)
- **Runtime:** Node.js 24.x
- **Handlers:** news, sentiment, predict, batch news/sentiment

---

## Testing Strategy

### Unit Tests (Python)
- Test data transformation functions (yfinance → Tiingo format)
- Test validation logic
- Test error handling
- Mock yfinance responses
- Mock DynamoDB operations

**Framework:** pytest with pytest-mock

### Integration Tests (Mocked)
- Test Lambda handler with mocked yfinance and DynamoDB
- Verify request/response format matches existing contract
- Test cache hit/miss scenarios

**Mocking approach:**
- Use `unittest.mock` for yfinance
- Use `moto` library for DynamoDB mocking

### CI Pipeline
- Run pytest with mocked dependencies
- No live AWS resources needed
- No yfinance API calls (mock responses)

---

## Deployment Script Specifications

### Current State
The existing `backend/scripts/deploy.sh` handles:
1. Interactive prompts for region, stack name, API keys
2. Saves config to `.env.deploy`
3. ML model setup and upload
4. SAM build and deploy
5. Updates frontend `.env` with API URL

### Required Changes

**New environment variable (optional):**
- No new API keys needed (yfinance doesn't require authentication)
- Remove prompts for TIINGO_API_KEY (can keep for backwards compatibility or remove)

**Build step changes:**
- Add Python dependencies packaging step
- Build Lambda Layer or container image

**Template parameter changes:**
- Remove TiingoApiKey parameter
- Keep FinnhubApiKey (still used for news)

### Deploy Script Logic

```
1. Load .env.deploy if exists
2. Prompt for region, stack name (keep existing)
3. Prompt for Finnhub API key (keep existing)
4. Remove Tiingo API key prompt (no longer needed)
5. Save to .env.deploy
6. Build ML service (existing)
7. SAM build (handles both Node.js and Python automatically)
8. Deploy with SAM
9. Update frontend .env (existing)
```

**Note:** SAM automatically handles Python dependency packaging via `requirements.txt`. No manual layer creation needed.

---

## Shared Patterns and Conventions

### Python Code Style
- Type hints for all functions
- Docstrings for public functions
- snake_case for functions/variables
- PascalCase for classes
- Use dataclasses for response types

### Error Handling Pattern
```python
class APIError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)
```

### Response Format Pattern
```python
def success_response(data: Any, meta: dict = None) -> dict:
    body = {"data": data}
    if meta:
        body["_meta"] = meta
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(body)
    }

def error_response(message: str, status_code: int = 500) -> dict:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"error": message})
    }
```

### Logging Pattern
```python
import logging
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Usage
logger.info(f"[StocksHandler] Fetching prices for {ticker}")
logger.error(f"[StocksHandler] Error: {error}", exc_info=True)
```

---

## File Structure (Target)

```
backend/
├── python/                      # NEW: Python Lambda source
│   ├── handlers/
│   │   ├── __init__.py
│   │   ├── stocks.py           # /stocks endpoint
│   │   ├── search.py           # /search endpoint
│   │   └── batch.py            # /batch/stocks endpoint
│   ├── services/
│   │   ├── __init__.py
│   │   └── yfinance_service.py # yfinance wrapper
│   ├── repositories/
│   │   ├── __init__.py
│   │   └── stocks_cache.py     # DynamoDB cache operations
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── response.py         # Response formatters
│   │   ├── transform.py        # yfinance → Tiingo transforms
│   │   └── error.py            # Error classes
│   ├── types/
│   │   ├── __init__.py
│   │   └── stock_types.py      # Type definitions
│   ├── index.py                # Lambda entry point (router)
│   └── requirements.txt        # Python dependencies
├── python_tests/               # NEW: Python tests
│   ├── __init__.py
│   ├── conftest.py             # pytest fixtures
│   ├── test_stocks_handler.py
│   ├── test_search_handler.py
│   ├── test_batch_handler.py
│   ├── test_yfinance_service.py
│   └── test_transform.py
├── src/                        # Existing Node.js (modified)
│   ├── handlers/
│   │   ├── stocks.handler.ts   # REMOVE or gut
│   │   ├── search.handler.ts   # REMOVE
│   │   ├── batch.handler.ts    # Keep batch news/sentiment only
│   │   └── ...                 # Keep other handlers
│   ├── services/
│   │   ├── tiingo.service.ts   # REMOVE
│   │   └── ...                 # Keep other services
│   └── ...
├── template.yaml               # Modified for dual Lambda
└── scripts/
    └── deploy.sh               # Modified for Python build
```

---

## Phase Verification

Phase 0 is complete when:
- [ ] This document is reviewed and approved
- [ ] All ADRs are understood and agreed upon
- [ ] Testing strategy is clear
- [ ] File structure is understood
- [ ] Ready to proceed to Phase 1

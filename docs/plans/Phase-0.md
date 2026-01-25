# Phase 0: Foundation

This document establishes architecture decisions, conventions, and patterns that apply to all subsequent phases. Implementation engineers should read this first.

---

## Architecture Decision Records (ADRs)

### ADR-001: No API Authentication (Intentional)

**Status:** Accepted

**Context:** The React Stocks API has no authentication. Code reviewers and automated tools flag this as a security issue.

**Decision:** Authentication is intentionally omitted. This is a personal/demo application with:
- No user accounts or private data
- No write operations that could be abused (all endpoints are read-only or compute-only)
- No billing or cost risk beyond existing AWS Lambda/DynamoDB billing (which has CloudWatch alarms)

**Rationale:**
1. Adding auth (Cognito, API keys) increases deployment complexity without providing value
2. The "attack surface" is limited to: (a) someone fetching public stock data, (b) triggering sentiment analysis compute. Both are bounded by Lambda concurrency limits and DynamoDB PAY_PER_REQUEST billing.
3. GraphQL/AppSync is considered as a future direction if auth becomes necessary

**Consequences:**
- Must document this decision inline in `template.yaml` and `CLAUDE.md`
- Automated reviewers will still flag; documentation explains the rationale
- If the app ever handles user data, this decision must be revisited

---

### ADR-002: CORS AllowedOrigins Parameterization

**Status:** Accepted

**Context:** The SAM template defaults `AllowedOrigins: '*'` which reviewers flag as insecure.

**Decision:** Keep the existing parameterization via `.env.deploy`. The default `'*'` is acceptable because:
- With no authentication, CORS provides no security benefit (there's nothing to protect via same-origin policy)
- The parameter allows production deployments to lock down origins if desired

**Consequences:**
- Add inline comments in `template.yaml` explaining the security model
- Add guidance in `CLAUDE.md` for reviewers

---

### ADR-003: DynamoDB Single-Table Design

**Status:** Accepted

**Context:** The current 7-table design was flagged as over-engineering. Tables have different TTL policies but share similar access patterns (ticker-based lookups).

**Decision:** Consolidate into a true single-table design using composite keys:

| Current Table | New PK | New SK | TTL |
|--------------|--------|--------|-----|
| StocksCache | `STOCK#AAPL` | `DATE#2024-01-15` | 7-90 days (date-based) |
| NewsCache | `NEWS#AAPL` | `HASH#abc123` | 7 days |
| SentimentCache | `SENT#AAPL` | `HASH#abc123` | 30 days |
| SentimentJobs | `JOB#jobId` | `META` | 1 day |
| StockHistoricalData | `HIST#AAPL` | `DATE#2024-01-15` | None (persistent) |
| ArticleAnalysisData | `ARTICLE#AAPL` | `HASH#abc123#DATE#2024-01-15` | None (persistent) |
| DailySentimentAggregate | `DAILY#AAPL` | `DATE#2024-01-15` | None (persistent) |
| (NEW) CircuitBreaker | `CIRCUIT#mlsentiment` | `STATE` | None |

**Access Patterns:**
1. Get stock price by ticker+date: `PK=STOCK#AAPL, SK=DATE#2024-01-15`
2. Query all stock prices for ticker in range: `PK=STOCK#AAPL, SK between DATE#start and DATE#end`
3. Get news article by ticker+hash: `PK=NEWS#AAPL, SK=HASH#abc123`
4. Query all news for ticker: `PK=NEWS#AAPL, SK begins_with HASH#`
5. Get sentiment job status: `PK=JOB#jobId, SK=META`
6. Get circuit breaker state: `PK=CIRCUIT#mlsentiment, SK=STATE`

**Rationale:**
1. Reduces CloudFormation resource count from 7 tables to 1
2. Simplifies IAM policies (one table ARN)
3. TTL still works per-item (each item has its own `ttl` attribute)
4. Access patterns remain efficient (no GSI needed for current queries)

**Consequences:**
- All repositories refactored to use new key structure
- One-time data migration script (optional - can let old tables TTL expire)
- Template.yaml significantly simplified

---

### ADR-004: Circuit Breaker State Persistence

**Status:** Accepted

**Context:** The ML sentiment service circuit breaker uses module-level variables that reset on Lambda cold starts, potentially masking persistent outages.

**Decision:** Persist circuit breaker state to DynamoDB as a new entity type in the single table:
- `PK=CIRCUIT#mlsentiment, SK=STATE`
- Attributes: `consecutiveFailures`, `circuitOpenUntil`, `lastUpdated`

**Access Pattern:**
1. On each ML sentiment call, read circuit state (adds ~2ms latency)
2. On failure/success, update circuit state
3. No TTL (persist indefinitely, state self-corrects)

**Rationale:**
- Simple to implement with single-table design
- Predictable ~2ms overhead per ML call is acceptable
- State survives cold starts, container recycling, and multi-instance scenarios

**Consequences:**
- `mlSentiment.service.ts` refactored to read/write DynamoDB
- New repository methods: `getCircuitState()`, `updateCircuitState()`

---

### ADR-005: Magic Numbers Centralization

**Status:** Accepted

**Context:** Magic numbers scattered across services lack derivation. Examples: `HEADLINE_WEIGHT=3.0`, `MIN_DAYS_FOR_PREDICTIONS=29`, `MAX_TEXT_LENGTH=5000`.

**Decision:** Create centralized TypeScript constant files with JSDoc derivation:
- `backend/src/constants/ml.constants.ts` - ML/prediction thresholds
- `backend/src/constants/cache.constants.ts` - TTL values
- `backend/src/constants/pipeline.constants.ts` - Processing thresholds
- `frontend/src/constants/ml.constants.ts` - Browser-side ML thresholds

Each constant includes a JSDoc comment explaining:
1. What the value represents
2. Why this specific value was chosen
3. Source/derivation (testing, research, or empirical observation)

**Rationale:**
- Type-safe constants with IDE autocomplete
- Derivations visible on hover in IDEs
- Compile-time checking (vs runtime config loading)
- Single source of truth for each domain

---

### ADR-006: F-Test Diagnostics Purpose

**Status:** Accepted

**Context:** The prediction service includes ANOVA F-test computations which seem over-engineered for a stock tracker.

**Decision:** Document that F-test diagnostics are active development tooling:
- Used during model development to identify significant features
- Logged to console for developer inspection
- Can be disabled via `LOG_LEVEL` environment variable
- Not shown to end users

**Consequences:**
- Add inline comment in `prediction.service.ts` explaining purpose
- Note in `CLAUDE.md` that this is development instrumentation

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Expo/React Native, TypeScript, TanStack Query | Cross-platform mobile/web |
| Backend (Node.js) | Lambda, API Gateway v2, DynamoDB | News, sentiment, prediction |
| Backend (Python) | Lambda, yfinance | Stock prices, search |
| IaC | AWS SAM | CloudFormation transform |
| Testing | Jest, pytest | Frontend 30%, Backend 70% coverage |

---

## Conventions

### File Naming
- Services: `*.service.ts`
- Repositories: `*.repository.ts`
- Constants: `*.constants.ts`
- Types: `*.types.ts`
- Tests: `*.test.ts` in `__tests__/` directories

### Commit Messages
Use conventional commits format:

```
type(scope): brief description

- Detail 1
- Detail 2
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Scopes: `backend`, `frontend`, `infra`, `ml`

**Important:** Do NOT include Co-Authored-By or Generated-by attribution lines.

### TypeScript
- Strict mode enabled
- Use `as const` for literal types
- JSDoc for public APIs
- Prefer interfaces over type aliases for object shapes

### Testing Strategy

**Unit Tests:**
- Mock all external dependencies (DynamoDB, APIs)
- Use `jest.mock()` for modules
- Test files adjacent to source in `__tests__/` directories

**Integration Tests:**
- Use `@aws-sdk/lib-dynamodb` with mocked DynamoDBDocumentClient
- No live cloud resources in CI
- Environment variables from `.env.test`

**Coverage Thresholds:**
- Frontend: 30% (UI-heavy, lower coverage acceptable)
- Backend: 70% (business logic, higher coverage required)

---

## Deployment Strategy

### Development
```bash
npm run check        # Lint + type-check + tests
npm run hygiene      # Dead code detection
```

### Production
```bash
cd backend
source .env.deploy   # Load secrets
npm run deploy       # sam build && sam deploy
```

The deploy script:
1. Builds with esbuild (Node.js) and pip (Python)
2. Deploys CloudFormation stack
3. Outputs API URL to `frontend/.env`

---

## Shared Patterns

### Repository Pattern
All data access goes through repositories:
```typescript
// Good
const news = await NewsRepository.getByTicker(ticker);

// Bad (bypasses repository)
const result = await dynamodb.send(new QueryCommand({...}));
```

### Error Handling
Use custom `APIError` class with status codes:
```typescript
throw new APIError('Not found', 404);
```

Handlers catch and return appropriate HTTP responses.

### Logging
Prefix all logs with component name:
```typescript
console.log('[SentimentService] Processing ticker:', ticker);
```

---

## Phase Dependencies

```
Phase 0 (this document)
    ↓
Phase 1: Documentation + Constants
    ↓
Phase 2: Single-Table Migration + Circuit Breaker
```

Phase 2 depends on Phase 1 only for the constants being available (the circuit breaker constants will use the new pattern).

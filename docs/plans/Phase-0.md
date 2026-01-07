# Phase 0: Foundation

## Phase Goal

Establish the tools, methodology, and patterns for the code hygiene audit. Define what constitutes "dead code" and "inefficiency" in this codebase, and set up the analysis infrastructure.

**Success Criteria:**
- Tools installed and configured (knip, vulture)
- Audit methodology documented
- Entry points mapped
- Analysis patterns defined

**Estimated Tokens:** ~10,000

## Prerequisites

- Access to the codebase
- Node.js 24.x installed
- Python 3.13 with uv installed

---

## Architecture Decisions (ADRs)

### ADR-1: Conservative Cleanup Approach

**Decision:** Only remove dead code and unused imports. Preserve all comments, docstrings, and console.log statements.

**Context:** User requested conservative approach to avoid breaking production code.

**Rationale:**
- Minimizes risk of removing code that appears dead but has side effects
- Preserves debugging capability
- Allows incremental cleanup in future iterations

**Consequences:**
- Some "noise" remains in codebase
- Future phases can increase aggression if desired

### ADR-2: Tool Selection

**Decision:** Use knip for TypeScript/JavaScript and vulture for Python.

**Tools Chosen:**

| Tool | Language | Purpose |
|------|----------|---------|
| knip | TS/JS | Dead exports, unused files, unused dependencies |
| vulture | Python | Unused functions, variables, imports |

**Rationale:**
- knip is AST-aware and understands TypeScript/ESM
- vulture is the standard Python dead code detector
- Both integrate easily into CI if needed later

**Alternatives Rejected:**
- ts-prune: Less maintained, fewer features than knip
- pylint: Too broad, not focused on dead code
- ESLint unused rules: Don't catch cross-file dead exports

### ADR-3: Runtime Inefficiency Patterns

**Decision:** Manually identify runtime inefficiencies using pattern matching, not dynamic analysis.

**Context:** Recent Finnhub rate limit issue was caused by legacy fallback code making 30 API calls per request. We need to find similar patterns.

**Patterns to Detect:**

1. **N+1 API Calls** - Loops that make API calls per item instead of batch
   ```typescript
   // BAD: N calls
   for (const date of dates) {
     await fetchSentiment(ticker, date);
   }
   // GOOD: 1 call
   await fetchSentimentBatch(ticker, dates);
   ```

2. **Heavy Module Imports at Top Level** - Imports that slow cold starts
   ```python
   # BAD: Loads pandas on every cold start
   import pandas as pd

   # GOOD: Lazy import
   def get_pandas():
       import pandas as pd
       return pd
   ```

3. **Fallback Sync Patterns** - Code that syncs data "just in case"
   ```typescript
   // BAD: Always syncs even when not needed
   if (localData.length === 0) {
     await syncFromRemote(); // Hidden N+1
   }
   ```

4. **Redundant Metadata Fetches** - Fetching full metadata when partial suffices
   ```typescript
   // BAD: Fetches full metadata for each search result
   const results = await search(query);
   for (const r of results) {
     await fetchMetadata(r.ticker); // Unnecessary!
   }
   ```

### ADR-4: Entry Point Mapping

**Decision:** Map all entry points to trace reachable code.

**Entry Points Identified:**

**Frontend:**
- `frontend/app/_layout.tsx` - Root layout (initializes providers)
- `frontend/app/(tabs)/*.tsx` - Tab screens
- `frontend/src/hooks/*.ts` - Hooks (called from components)
- `frontend/src/contexts/*.tsx` - Context providers

**Backend TypeScript:**
- `backend/src/index.ts` - Main Lambda handler
- Routes: `/news`, `/sentiment`, `/prediction`, `/events`, `/batch`

**Backend Python:**
- `backend/python/index.py` - Python Lambda handler (stocks)
- Routes: `/stocks`, `/search`, `/batch/stocks`
- `backend/services/ml/handler.py` - ML service handler (DistilFinBERT)
- `backend/services/ml/app.py` - ML application logic

**Tests:**
- All `*.test.ts`, `*.test.tsx`, `test_*.py` files

**Scripts:**
- `backend/scripts/*.sh`, `backend/scripts/*.ts`

---

## Tool Configuration

### knip Configuration

Create `knip.json` in project root:

```json
{
  "workspaces": {
    "frontend": {
      "entry": [
        "app/_layout.tsx",
        "app/**/*.tsx",
        "src/hooks/*.ts",
        "src/contexts/*.tsx"
      ],
      "project": ["src/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
      "ignore": ["**/__tests__/**", "**/*.test.{ts,tsx}"]
    },
    "backend": {
      "entry": ["src/index.ts", "scripts/*.ts"],
      "project": ["src/**/*.ts"],
      "ignore": ["**/__tests__/**", "**/*.test.ts"]
    }
  },
  "ignoreDependencies": ["jest-expo", "@testing-library/*"]
}
```

**Note:** Verify knip workspace syntax is compatible with your installed version. Run `npx knip --help` to confirm. The above uses knip v5+ syntax for npm workspaces.

### vulture Configuration

Create `backend/vulture_whitelist.py` and use command-line:

```bash
# Analyze both Python directories
vulture backend/python/ backend/services/ml/ \
  --exclude "backend/python_tests/,__pycache__" \
  --min-confidence 80 \
  --whitelist backend/vulture_whitelist.py
```

**Whitelist file** (`backend/vulture_whitelist.py`):
```python
# Lambda handler entry points (called by AWS, appear unused locally)
handler
lambda_handler

# Flask/WSGI entry points (ML service)
app
create_app

# pytest fixtures
conftest.py
```

---

## Audit Methodology

### Step 1: Static Analysis (Dead Code)

Run knip and vulture to identify:
- Unused exports
- Unused files
- Unused dependencies
- Unreachable functions/variables

### Step 2: Runtime Pattern Analysis

Manually grep for inefficiency patterns:

```bash
# Find potential N+1 loops
grep -rn "for.*await" frontend/src/ backend/src/

# Find sync/fetch in loops
grep -rn "\.forEach.*await\|\.map.*await" frontend/src/ backend/src/

# Find heavy imports at module level
grep -rn "^import pandas\|^import yfinance\|^import torch" backend/python/
```

### Step 3: Verification

For each identified issue:
1. Trace the code path from entry points
2. Verify it's truly dead (not dynamic imports, not side effects)
3. Remove or flag for review

### Step 4: Testing

After each removal:
1. Run `npm run lint` and `npm test`
2. Run `pytest backend/python_tests/`
3. Verify no regressions

---

## Shared Patterns

### Safe Deletion Criteria

Code is safe to delete if ALL of these are true:
- [ ] Not referenced from any entry point (static analysis)
- [ ] Not dynamically imported/required
- [ ] No side effects on import (doesn't register handlers, etc.)
- [ ] Not used by tests (unless test itself is orphaned)
- [ ] Not a public API consumed by external code

### Unsafe Patterns (Do Not Delete)

- Event handlers registered at module level
- Polyfills imported for side effects
- Type declarations used only for inference
- Config files referenced by tooling (not code)

---

## File Structure (Deliverables)

```
/
├── scripts/                   # NEW: Root-level scripts directory
│   └── code-hygiene.sh        # NEW: Automated audit script (monorepo-level)
├── knip.json                  # NEW: knip configuration
├── backend/
│   └── vulture_whitelist.py   # NEW: vulture whitelist (backend-specific)
└── docs/
    └── plans/
        ├── README.md
        ├── Phase-0.md
        └── Phase-1.md
```

**Note:** `scripts/` is created at root level (not `backend/scripts/`) because code-hygiene.sh is monorepo-level tooling that analyzes both frontend and backend.

---

## Phase Verification

Phase 0 is complete when:
- [ ] This document is reviewed and understood
- [ ] knip is installed (`npm install -D knip`)
- [ ] vulture is installed (`uv pip install vulture`)
- [ ] Entry points are understood
- [ ] Inefficiency patterns are understood
- [ ] Ready to proceed to Phase 1

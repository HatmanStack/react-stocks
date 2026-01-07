# Phase 1: Implementation

## Phase Goal

Execute the code hygiene audit, fix identified issues, and create an automated script for ongoing hygiene checks.

**Success Criteria:**
- All dead code identified and removed
- All unused imports removed
- Runtime inefficiency patterns documented
- Automated hygiene script created
- All tests pass

**Estimated Tokens:** ~40,000

## Prerequisites

- Phase 0 complete and understood
- knip installed (`npm install -D knip`)
- vulture installed (`uv pip install vulture`)

---

## Task 1: Install and Configure knip

**Goal:** Set up knip for TypeScript/JavaScript dead code detection across the monorepo.

**Files to Create:**
- `knip.json` - knip configuration for workspaces

**Prerequisites:**
- None (first task)

**Implementation Steps:**
1. Install knip as a dev dependency at root level
2. Create `knip.json` configuration file with workspace definitions
3. Configure entry points for frontend (Expo Router pages, hooks, contexts)
4. Configure entry points for backend (Lambda handler, scripts)
5. Add ignore patterns for test files, generated code, and known false positives
6. Run initial analysis to verify configuration works

**Configuration Notes:**
- Frontend uses Expo Router file-based routing - entry points are `app/**/*.tsx`
- Frontend hooks are entry points since they're imported by components
- Backend entry is `src/index.ts` which routes to handlers
- Ignore jest-expo and testing-library as they're test-only deps

**Verification Checklist:**
- [ ] `npm install -D knip` succeeds
- [ ] `knip.json` exists with correct workspace config
- [ ] `npx knip` runs without errors
- [ ] Output shows analysis of both frontend and backend

**Testing Instructions:**
- Run `npx knip` and verify it produces output
- Run `npx knip --no-exit-code` to see results without failing

**Commit Message Template:**
```
chore: add knip for dead code detection

Install knip as dev dependency
Add knip.json with monorepo workspace configuration
Configure entry points for frontend and backend
```

---

## Task 2: Install vulture for Python

**Goal:** Set up vulture for Python dead code detection.

**Files to Create:**
- `backend/vulture_whitelist.py` - Whitelist for known false positives

**Prerequisites:**
- Task 1 complete

**Implementation Steps:**
1. Install vulture using uv
2. Create whitelist file at `backend/vulture_whitelist.py` for:
   - Lambda handler entry points (`handler`, `lambda_handler`)
   - ML service entry points (`app`, `create_app`)
   - pytest fixture names from `conftest.py`
3. Run initial analysis on both Python directories:
   - `backend/python/` (stocks Lambda)
   - `backend/services/ml/` (ML service)
4. Tune confidence threshold (start at 80%)

**Whitelist Contents:**
- `handler`, `lambda_handler` (Lambda entry points)
- `app`, `create_app` (ML service Flask/WSGI)
- pytest fixture names from `conftest.py`
- Any `__all__` exports

**Verification Checklist:**
- [ ] `uv pip install vulture` succeeds
- [ ] `backend/vulture_whitelist.py` exists
- [ ] `vulture backend/python/ backend/services/ml/ --min-confidence 80` runs
- [ ] Output shows analysis results for both directories

**Testing Instructions:**
- Run `vulture backend/python/ backend/services/ml/ --exclude backend/python_tests/,__pycache__ --whitelist backend/vulture_whitelist.py`
- Verify results are reasonable (not flagging entry points)

**Commit Message Template:**
```
chore: add vulture for Python dead code detection

Install vulture via uv
Add whitelist for Lambda handler and pytest fixtures
```

---

## Task 3: Run Frontend Dead Code Analysis

**Goal:** Identify and remove dead code in the frontend codebase.

**Files to Modify:**
- Various frontend files based on knip output

**Prerequisites:**
- Task 1 complete

**Implementation Steps:**
1. Run `npx knip --include files` to find unused files
2. Run `npx knip --include exports` to find unused exports
3. Run `npx knip --include dependencies` to find unused dependencies
4. For each finding:
   - Verify it's truly dead (trace from entry points)
   - Check if it's used by tests (may need to keep or remove test too)
   - Remove if confirmed dead
5. Run `npm run lint` and `npm test` after each batch of removals

**Expected Findings (based on codebase exploration):**
- Unused utility functions in `src/utils/`
- Unused type exports in `src/types/`
- Potentially unused service functions replaced by backend

**Verification Checklist:**
- [ ] All unused files removed or justified
- [ ] All unused exports removed
- [ ] No unused dependencies in package.json
- [ ] `npm run lint` passes
- [ ] `npm test` passes

**Testing Instructions:**
- Run `npx knip` - should show no issues (or only whitelisted)
- Run `npm test` - all tests pass
- Run `npm run lint` - no errors

**Commit Message Template:**
```
refactor(frontend): remove dead code identified by knip

Remove unused exports from [files]
Remove unused utility functions
Clean up unused type definitions
```

---

## Task 4: Run Backend TypeScript Dead Code Analysis

**Goal:** Identify and remove dead code in the backend TypeScript codebase.

**Files to Modify:**
- Various backend TypeScript files based on knip output

**Prerequisites:**
- Task 1 complete

**Implementation Steps:**
1. Run `npx knip` focused on backend workspace
2. Pay special attention to:
   - Handler functions that may have been replaced by Python
   - Service functions no longer called
   - Utility functions with no callers
3. Verify each finding by tracing from `src/index.ts`
4. Remove confirmed dead code
5. Run backend tests after each batch

**Known Areas to Investigate:**
- `src/handlers/` - any handlers replaced by Python Lambda
- `src/services/` - Tiingo service should be gone (from yfinance migration)
- `src/utils/` - transformation utilities that may be orphaned

**Verification Checklist:**
- [ ] All unused handler functions removed
- [ ] All unused service functions removed
- [ ] All unused utility functions removed
- [ ] `cd backend && npm run lint` passes
- [ ] `cd backend && npm test` passes

**Testing Instructions:**
- Run `npx knip` for backend - should show no issues
- Run `cd backend && npm test` - all tests pass

**Commit Message Template:**
```
refactor(backend): remove dead TypeScript code

Remove unused handler functions
Remove orphaned service methods
Clean up unused utilities
```

---

## Task 5: Run Python Dead Code Analysis

**Goal:** Identify and remove dead code in both Python codebases (stocks Lambda and ML service).

**Files to Modify:**
- Various Python files based on vulture output in:
  - `backend/python/` (stocks Lambda)
  - `backend/services/ml/` (ML service)

**Prerequisites:**
- Task 2 complete

**Implementation Steps:**
1. Run vulture on both Python directories:
   ```bash
   vulture backend/python/ backend/services/ml/ \
     --exclude backend/python_tests/,__pycache__ \
     --min-confidence 80 \
     --whitelist backend/vulture_whitelist.py
   ```
2. Review each finding:
   - Check if it's a false positive (entry point, fixture)
   - Add to whitelist if legitimate but appears unused
   - Remove if confirmed dead
3. Run pytest after each batch of removals
4. Also run ML tests: `pytest tests/backend/ml/ -v`

**Expected Findings:**
- Unused helper functions
- Unused import aliases
- Unused variables
- Potentially unused model functions in ML service

**Verification Checklist:**
- [ ] All dead code removed or whitelisted
- [ ] `vulture backend/python/ backend/services/ml/` shows only whitelisted items
- [ ] `pytest backend/python_tests/` passes
- [ ] `pytest tests/backend/ml/` passes

**Testing Instructions:**
- Run `vulture backend/python/ backend/services/ml/ --min-confidence 80 --whitelist backend/vulture_whitelist.py`
- Run `pytest backend/python_tests/ -v`
- Run `pytest tests/backend/ml/ -v`

**Commit Message Template:**
```
refactor(backend): remove dead Python code

Remove unused helper functions
Clean up unused imports
Update vulture whitelist for false positives
```

---

## Task 6: Runtime Inefficiency Pattern Analysis

**Goal:** Manually identify runtime inefficiencies similar to the Finnhub N+1 issue.

**Files to Analyze:**
- `frontend/src/hooks/*.ts` - Data fetching hooks
- `frontend/src/services/**/*.ts` - API service calls (in `api/` and `sync/` subdirs)
- `backend/src/handlers/*.ts` - Request handlers
- `backend/python/handlers/*.py` - Python handlers
- `backend/services/ml/*.py` - ML service

**Prerequisites:**
- Tasks 3-5 complete

**Implementation Steps:**
1. Search for N+1 API call patterns:
   ```bash
   grep -rn "for.*await\|\.forEach.*await\|\.map.*await" frontend/src/ backend/src/
   ```

2. Search for heavy imports at module level (Python):
   ```bash
   grep -rn "^import pandas\|^import numpy\|^import yfinance" backend/python/
   ```
   Note: yfinance lazy imports were already implemented

3. Search for sync/fallback patterns:
   ```bash
   grep -rn "syncSentiment\|syncNews\|syncStock" frontend/src/
   ```

4. Search for redundant fetch patterns:
   ```bash
   grep -rn "fetchMetadata\|fetchSymbol" frontend/src/
   ```

5. Document each finding with:
   - Location (file:line)
   - Pattern type (N+1, heavy import, redundant fetch)
   - Severity (critical, moderate, low)
   - Recommended fix

**Known Patterns Already Fixed:**
- Finnhub 30-call loop in `useSentimentData.ts` (removed)
- 7 metadata fetches in `useSymbolSearch.ts` (removed)
- Heavy yfinance/pandas imports (lazy loading implemented)

**Verification Checklist:**
- [ ] All hooks analyzed for fetch patterns
- [ ] All services analyzed for API calls
- [ ] Findings documented
- [ ] Critical issues fixed

**Testing Instructions:**
- Run searches and review results
- For each fix, run relevant tests

**Commit Message Template:**
```
perf(frontend): fix [pattern] in [location]

Identified [N+1/heavy import/redundant fetch] pattern
[Description of fix]
```

---

## Task 7: Unused Import Cleanup

**Goal:** Remove all unused imports across the codebase.

**Files to Modify:**
- All TypeScript/TSX files with unused imports
- All Python files with unused imports

**Prerequisites:**
- Tasks 3-6 complete

**Implementation Steps:**
1. For TypeScript, ESLint already catches unused imports - run:
   ```bash
   cd frontend && npx eslint . --ext .ts,.tsx --fix
   cd backend && npm run lint -- --fix
   ```

2. For Python, use autoflake or manual removal:
   ```bash
   uv pip install autoflake
   autoflake --in-place --remove-all-unused-imports backend/python/**/*.py
   ```

3. Review changes and commit

**Verification Checklist:**
- [ ] No unused imports in frontend
- [ ] No unused imports in backend TypeScript
- [ ] No unused imports in backend Python
- [ ] All tests pass

**Testing Instructions:**
- Run `npm run lint` (should pass)
- Run `pytest backend/python_tests/` (should pass)

**Commit Message Template:**
```
style: remove unused imports

Auto-fix unused imports in frontend
Auto-fix unused imports in backend TypeScript
Auto-fix unused imports in backend Python
```

---

## Task 8: Create Automated Hygiene Script

**Goal:** Create a bash script that runs all hygiene checks for ongoing maintenance.

**Files to Create:**
- `scripts/code-hygiene.sh` - Automated audit script (root-level, NOT `backend/scripts/`)

**Files to Modify:**
- `package.json` (root) - Add `hygiene` script

**Prerequisites:**
- Tasks 1-7 complete

**Implementation Steps:**
1. Create `scripts/` directory at project root (monorepo-level tooling)
2. Create script that runs:
   - knip for TypeScript dead code
   - vulture for Python dead code (both directories)
   - ESLint for unused imports
   - ruff for Python style
3. Output results in readable format
4. Exit with non-zero if issues found
5. Add `"hygiene": "./scripts/code-hygiene.sh"` to root `package.json` scripts

**Script Structure:**
```bash
#!/bin/bash
set -e

echo "=== Code Hygiene Audit ==="

echo "\n[1/4] Running knip (TypeScript dead code)..."
npx knip --no-exit-code

echo "\n[2/4] Running vulture (Python dead code)..."
vulture backend/python/ backend/services/ml/ \
  --exclude backend/python_tests/,__pycache__ \
  --min-confidence 80 \
  --whitelist backend/vulture_whitelist.py

echo "\n[3/4] Checking TypeScript lint..."
npm run lint

echo "\n[4/4] Checking Python lint..."
uvx ruff check backend/python backend/python_tests backend/services/ml

echo "\n=== Audit Complete ==="
```

**Verification Checklist:**
- [ ] `scripts/` directory exists at project root
- [ ] Script is executable (`chmod +x scripts/code-hygiene.sh`)
- [ ] Script runs all checks (including ML service)
- [ ] Script output is readable
- [ ] Script exits non-zero on failure
- [ ] Added to root `package.json` as `npm run hygiene`

**Testing Instructions:**
- Run `./scripts/code-hygiene.sh`
- Verify all checks run
- Verify exit code is 0 when clean
- Run `npm run hygiene` from project root

**Commit Message Template:**
```
feat: add automated code hygiene script

Create scripts/code-hygiene.sh for dead code detection
Run knip, vulture, eslint, and ruff checks
Add npm run hygiene script
```

---

## Task 9: Final Verification and Documentation

**Goal:** Verify all cleanup is complete and document findings.

**Files to Modify:**
- `docs/plans/Phase-1.md` - Add verification results

**Prerequisites:**
- Tasks 1-8 complete

**Implementation Steps:**
1. Run full hygiene script: `./scripts/code-hygiene.sh`
2. Run all tests:
   ```bash
   npm test
   cd backend && npm test
   pytest backend/python_tests/
   ```
3. Document:
   - Total files removed
   - Total functions/exports removed
   - Inefficiency patterns fixed
   - Any remaining known issues

**Verification Checklist:**
- [ ] `./scripts/code-hygiene.sh` passes
- [ ] All tests pass
- [ ] No regressions in functionality
- [ ] Documentation updated

**Testing Instructions:**
- Run full test suite
- Manual smoke test of key features

**Commit Message Template:**
```
docs: complete code hygiene audit

Document removed dead code
Document fixed inefficiencies
Add verification results to Phase-1.md
```

---

## Phase Verification

Phase 1 is complete when:

- [ ] knip reports no unused exports/files (or only whitelisted)
- [ ] vulture reports no dead Python code (or only whitelisted)
- [ ] No unused imports in any file
- [ ] Runtime inefficiency patterns documented and fixed
- [ ] `./scripts/code-hygiene.sh` passes
- [ ] All frontend tests pass
- [ ] All backend TypeScript tests pass
- [ ] All backend Python tests pass (stocks + ML service)
- [ ] `npm run hygiene` added to root package.json

**Summary Metrics (fill in after completion):**

| Metric | Count |
|--------|-------|
| Files removed | TBD |
| Unused exports removed | TBD |
| Unused imports removed | TBD |
| Inefficiency patterns fixed | TBD |
| Test suites passing | 4/4 (frontend, backend TS, backend Python, ML) |

**Known Limitations:**
- Conservative approach means some "code smell" remains
- Dynamic imports may not be detected by static analysis
- Some false positives may be whitelisted rather than investigated deeply

---

## Audit Report Template

After completion, document findings here:

### Dead Code Removed

| Category | Files/Items | Notes |
|----------|-------------|-------|
| Unused files | | |
| Unused exports | | |
| Unused functions | | |
| Unused imports | | |

### Inefficiencies Fixed

| Pattern | Location | Fix |
|---------|----------|-----|
| | | |

### Whitelisted Items

| Item | Reason |
|------|--------|
| | |

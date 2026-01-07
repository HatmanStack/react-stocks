#!/bin/bash
#
# Code Hygiene Audit Script
# Runs dead code detection and lint checks across the monorepo
#
# Usage: ./scripts/code-hygiene.sh
# Exit codes:
#   0 - All checks passed
#   1 - One or more checks failed

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
FAILED=0

echo "=== Code Hygiene Audit ==="
echo ""

# [1/4] TypeScript dead code detection
echo -e "${YELLOW}[1/4] Running knip (TypeScript dead code)...${NC}"
if npx knip --no-exit-code 2>&1 | grep -q "^Unused"; then
    echo -e "${YELLOW}  Warning: knip found unused code (see output above)${NC}"
    npx knip --no-exit-code 2>&1 | head -50
else
    echo -e "${GREEN}  ✓ No unused TypeScript code detected${NC}"
fi
echo ""

# [2/4] Python dead code detection
echo -e "${YELLOW}[2/4] Running vulture (Python dead code)...${NC}"
VULTURE_OUTPUT=$(python3 -m vulture backend/python/ backend/services/ml/ backend/vulture_whitelist.py \
    --exclude "backend/python_tests/,__pycache__,.aws-sam" \
    --min-confidence 80 2>&1 || true)

if [ -n "$VULTURE_OUTPUT" ]; then
    echo -e "${RED}  ✗ Vulture found dead Python code:${NC}"
    echo "$VULTURE_OUTPUT"
    FAILED=1
else
    echo -e "${GREEN}  ✓ No dead Python code detected${NC}"
fi
echo ""

# [3/4] TypeScript lint check
echo -e "${YELLOW}[3/4] Checking TypeScript lint...${NC}"
if (cd frontend && npx expo lint 2>&1 | grep -q "error"); then
    echo -e "${RED}  ✗ ESLint errors found in frontend${NC}"
    FAILED=1
else
    echo -e "${GREEN}  ✓ Frontend lint passed${NC}"
fi

if (cd backend && npm run lint 2>&1 | grep -q "error"); then
    echo -e "${RED}  ✗ ESLint errors found in backend${NC}"
    FAILED=1
else
    echo -e "${GREEN}  ✓ Backend lint passed${NC}"
fi
echo ""

# [4/4] Python lint check
echo -e "${YELLOW}[4/4] Checking Python lint...${NC}"
if uvx ruff check backend/python backend/python_tests backend/services/ml 2>&1 | grep -q "error\|E[0-9]"; then
    echo -e "${RED}  ✗ Ruff errors found in Python code${NC}"
    uvx ruff check backend/python backend/python_tests backend/services/ml 2>&1 | head -20
    FAILED=1
else
    echo -e "${GREEN}  ✓ Python lint passed${NC}"
fi
echo ""

# Summary
echo "=== Audit Complete ==="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All checks passed!${NC}"
    exit 0
else
    echo -e "${RED}Some checks failed. Please review the output above.${NC}"
    exit 1
fi

#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== React Stocks Monorepo Reorganization ==="
echo "Working directory: $REPO_ROOT"
echo ""

DELETED_FILES=()
MOVED_FILES=()

log_delete() { DELETED_FILES+=("$1"); }
log_move() { MOVED_FILES+=("$1 -> $2"); }

# 1. Create target directories
echo "[1/8] Creating target directory structure..."
mkdir -p frontend/app frontend/src frontend/assets frontend/__mocks__
mkdir -p docs/architecture docs/plans docs/testing docs/user-guide docs/backend
mkdir -p tests/frontend/integration tests/frontend/e2e tests/frontend/hooks tests/frontend/services tests/frontend/database tests/frontend/utils
mkdir -p tests/backend/handlers tests/backend/services tests/backend/utils tests/backend/integration

# 2. Move frontend files
echo "[2/8] Moving frontend files to frontend/..."

# Move app/ directory (Expo Router pages)
if [ -d "app" ]; then
    mv app/* frontend/app/ 2>/dev/null || true
    rmdir app 2>/dev/null || true
    log_move "app/" "frontend/app/"
fi

# Move src/ directory
if [ -d "src" ]; then
    mv src/* frontend/src/ 2>/dev/null || true
    rmdir src 2>/dev/null || true
    log_move "src/" "frontend/src/"
fi

# Move assets/
if [ -d "assets" ]; then
    mv assets/* frontend/assets/ 2>/dev/null || true
    rmdir assets 2>/dev/null || true
    log_move "assets/" "frontend/assets/"
fi

# Move __mocks__/
if [ -d "__mocks__" ]; then
    mv __mocks__/* frontend/__mocks__/ 2>/dev/null || true
    rmdir __mocks__ 2>/dev/null || true
    log_move "__mocks__/" "frontend/__mocks__/"
fi

# Move frontend root files
for f in App.tsx index.ts babel.config.js jest.config.js jest.setup.js tsconfig.json app.json eas.json; do
    if [ -f "$f" ]; then
        mv "$f" frontend/
        log_move "$f" "frontend/$f"
    fi
done

# 3. Move frontend tests to tests/frontend/
echo "[3/8] Moving frontend tests to tests/frontend/..."
if [ -d "__tests__" ]; then
    # Move test subdirectories
    [ -d "__tests__/integration" ] && mv __tests__/integration/* tests/frontend/integration/ 2>/dev/null || true
    [ -d "__tests__/e2e" ] && mv __tests__/e2e/* tests/frontend/e2e/ 2>/dev/null || true
    [ -d "__tests__/hooks" ] && mv __tests__/hooks/* tests/frontend/hooks/ 2>/dev/null || true
    [ -d "__tests__/services" ] && mv __tests__/services/* tests/frontend/services/ 2>/dev/null || true
    [ -d "__tests__/database" ] && mv __tests__/database/* tests/frontend/database/ 2>/dev/null || true
    [ -d "__tests__/utils" ] && mv __tests__/utils/* tests/frontend/utils/ 2>/dev/null || true
    rm -rf __tests__
    log_move "__tests__/" "tests/frontend/"
fi

# 4. Move backend tests to tests/backend/
echo "[4/8] Moving backend tests to tests/backend/..."
if [ -d "backend/__tests__" ]; then
    [ -d "backend/__tests__/handlers" ] && mv backend/__tests__/handlers/* tests/backend/handlers/ 2>/dev/null || true
    [ -d "backend/__tests__/services" ] && mv backend/__tests__/services/* tests/backend/services/ 2>/dev/null || true
    [ -d "backend/__tests__/utils" ] && mv backend/__tests__/utils/* tests/backend/utils/ 2>/dev/null || true
    [ -d "backend/__tests__/integration" ] && mv backend/__tests__/integration/* tests/backend/integration/ 2>/dev/null || true
    [ -d "backend/__tests__/repositories" ] && mkdir -p tests/backend/repositories && mv backend/__tests__/repositories/* tests/backend/repositories/ 2>/dev/null || true
    [ -d "backend/__tests__/scripts" ] && mkdir -p tests/backend/scripts && mv backend/__tests__/scripts/* tests/backend/scripts/ 2>/dev/null || true
    [ -d "backend/__tests__/backend" ] && mv backend/__tests__/backend/* tests/backend/ 2>/dev/null || true
    [ -f "backend/__tests__/index.test.ts" ] && mv backend/__tests__/index.test.ts tests/backend/
    [ -f "backend/__tests__/placeholder.test.ts" ] && rm backend/__tests__/placeholder.test.ts
    rm -rf backend/__tests__
    log_move "backend/__tests__/" "tests/backend/"
fi

# Also move backend/src/__tests__ if exists
if [ -d "backend/src/__tests__" ]; then
    cp -r backend/src/__tests__/* tests/backend/ 2>/dev/null || true
    rm -rf backend/src/__tests__
fi

# 5. Consolidate documentation
echo "[5/8] Consolidating documentation to docs/..."

# Move backend docs
if [ -d "backend/docs" ]; then
    mv backend/docs/*.md docs/backend/ 2>/dev/null || true
    [ -d "backend/docs/plans" ] && mv backend/docs/plans/* docs/plans/ 2>/dev/null || true
    rm -rf backend/docs
    log_move "backend/docs/" "docs/backend/"
fi

# Move existing docs structure (already in docs/)
# Just ensure structure is correct

# Move scattered READMEs to docs
[ -f "backend/README.md" ] && mv backend/README.md docs/backend/README.md
[ -f "distilfinbert-service/README.md" ] && mv distilfinbert-service/README.md docs/backend/distilfinbert-README.md 2>/dev/null || true
[ -f "distilfinbert-service/DEPLOYMENT.md" ] && mv distilfinbert-service/DEPLOYMENT.md docs/backend/distilfinbert-DEPLOYMENT.md 2>/dev/null || true

# Move src utility READMEs
[ -f "frontend/src/utils/performance/README.md" ] && mv frontend/src/utils/performance/README.md docs/architecture/performance.md 2>/dev/null || true

# 6. Merge distilfinbert-service into backend
echo "[6/8] Merging distilfinbert-service into backend/services/ml/..."
if [ -d "distilfinbert-service" ]; then
    mkdir -p backend/services/ml
    [ -d "distilfinbert-service/app" ] && mv distilfinbert-service/app/* backend/services/ml/ 2>/dev/null || true
    [ -f "distilfinbert-service/requirements.txt" ] && mv distilfinbert-service/requirements.txt backend/requirements.txt
    [ -f "distilfinbert-service/Dockerfile" ] && mv distilfinbert-service/Dockerfile backend/Dockerfile.ml 2>/dev/null || true
    [ -f "distilfinbert-service/template.yaml" ] && mv distilfinbert-service/template.yaml backend/ml-template.yaml 2>/dev/null || true
    [ -f "distilfinbert-service/test_local.py" ] && mv distilfinbert-service/test_local.py tests/backend/test_ml_local.py 2>/dev/null || true
    rm -rf distilfinbert-service
    log_move "distilfinbert-service/" "backend/services/ml/"
fi

# 7. Delete CLAUDE.md files
echo "[7/8] Removing CLAUDE.md files..."
find . -name "CLAUDE.md" -type f -delete
log_delete "CLAUDE.md (all instances)"

# Delete other noise files
[ -f "CHANGELOG.md" ] && rm CHANGELOG.md && log_delete "CHANGELOG.md"
[ -f "SECURITY.md" ] && rm SECURITY.md && log_delete "SECURITY.md"
[ -f ".expo/README.md" ] && rm .expo/README.md 2>/dev/null || true

# 8. Clean up empty directories
echo "[8/8] Cleaning up empty directories..."
find . -type d -empty -delete 2>/dev/null || true

echo ""
echo "=== Reorganization Complete ==="
echo ""
echo "Files Deleted:"
for f in "${DELETED_FILES[@]}"; do echo "  - $f"; done
echo ""
echo "Files/Directories Moved:"
for m in "${MOVED_FILES[@]}"; do echo "  - $m"; done
echo ""
echo "Next steps:"
echo "  1. Run: node scripts/update-imports.js"
echo "  2. Update package.json scripts"
echo "  3. Create .github/workflows/ci.yml"
echo "  4. Run: npm install && npm test"

#!/bin/bash
# Deployment script for React Stocks backend

set -e

echo "======================================"
echo "React Stocks Backend Deployment"
echo "======================================"
echo ""

# Check if we're in the backend directory
if [ ! -f "template.yaml" ]; then
  echo "Error: template.yaml not found. Are you in the backend/ directory?"
  exit 1
fi

# Step 1: Build TypeScript
echo "[1/4] Building TypeScript..."
npm run build
echo "✓ Build complete"
echo ""

# Step 2: Validate SAM template
echo "[2/4] Validating SAM template..."
sam validate
echo "✓ Template valid"
echo ""

# Step 3: Build SAM package
echo "[3/4] Building SAM package..."
sam build
echo "✓ SAM build complete"
echo ""

# Step 4: Deploy
echo "[4/4] Deploying to AWS..."

# Check if this is first deployment or update
if [ "$1" == "--guided" ] || [ "$1" == "-g" ]; then
  echo "Running guided deployment..."
  sam deploy --guided
else
  echo "Running deployment with saved configuration..."
  sam deploy
fi

echo ""
echo "======================================"
echo "Deployment complete!"
echo "======================================"
echo ""

# Auto-update frontend .env file
if [ -f "./scripts/update-env.sh" ]; then
  echo ""
  ./scripts/update-env.sh
else
  echo "To view the API URL, run:"
  echo "  aws cloudformation describe-stacks --stack-name react-stocks-backend --query 'Stacks[0].Outputs[?OutputKey==\`ReactStocksApiUrl\`].OutputValue' --output text"
  echo ""
  echo "To view logs, run:"
  echo "  ./scripts/logs.sh"
fi

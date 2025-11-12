#!/bin/bash

#
# Production Deployment Script for React Stocks
#
# This script deploys the backend to AWS and provides instructions for frontend deployment
#
# Prerequisites:
# - AWS CLI configured with production account credentials
# - AWS SAM CLI installed (version 1.70.0+)
# - Tiingo and Polygon API keys ready
# - Production domain/hosting configured
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}React Stocks - Production Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Step 1: Pre-deployment validation
echo -e "${YELLOW}Step 1: Pre-deployment Validation${NC}"
echo "Running tests..."
cd "$(dirname "$0")/.."
npm test -- --passWithNoTests
if [ $? -ne 0 ]; then
    echo -e "${RED}Tests failed! Aborting deployment.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Tests passed${NC}"

echo "Checking security audit..."
npm audit --production
if [ $? -ne 0 ]; then
    echo -e "${RED}Security vulnerabilities found! Review and fix before deploying.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ No vulnerabilities in production dependencies${NC}"

echo ""

# Step 2: Confirm deployment
echo -e "${YELLOW}Step 2: Deployment Confirmation${NC}"
echo -e "${RED}WARNING: You are about to deploy to PRODUCTION!${NC}"
echo ""
read -p "Have you reviewed the deployment checklist? (yes/no): " checklist_confirmed
if [ "$checklist_confirmed" != "yes" ]; then
    echo -e "${RED}Deployment cancelled. Please review the checklist first.${NC}"
    echo "See: docs/deployment/production-deployment.md"
    exit 1
fi

read -p "Enter Tiingo API Key: " -s TIINGO_KEY
echo ""
read -p "Enter Polygon API Key: " -s POLYGON_KEY
echo ""
read -p "Enter allowed CORS origins (comma-separated): " CORS_ORIGINS

if [ -z "$TIINGO_KEY" ] || [ -z "$POLYGON_KEY" ]; then
    echo -e "${RED}API keys are required! Aborting.${NC}"
    exit 1
fi

echo ""

# Step 3: Deploy backend
echo -e "${YELLOW}Step 3: Deploying Backend to AWS${NC}"
cd backend

echo "Building Lambda function..."
sam build --use-container

echo "Deploying to AWS..."
sam deploy \
  --config-env production \
  --parameter-overrides \
    "TiingoApiKey=${TIINGO_KEY}" \
    "PolygonApiKey=${POLYGON_KEY}" \
    "AllowedOrigins=${CORS_ORIGINS:-https://yourdomain.com}"

if [ $? -ne 0 ]; then
    echo -e "${RED}Backend deployment failed! Check the error messages above.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Backend deployed successfully${NC}"
echo ""

# Step 4: Get API Gateway URL
echo -e "${YELLOW}Step 4: Retrieving API Gateway URL${NC}"
STACK_NAME="react-stocks-backend-prod"
API_URL=$(aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --query 'Stacks[0].Outputs[?OutputKey==`ReactStocksApiUrl`].OutputValue' \
  --output text)

echo -e "${GREEN}API Gateway URL: $API_URL${NC}"
echo ""

# Step 5: Frontend build instructions
echo -e "${YELLOW}Step 5: Frontend Deployment${NC}"
echo "Backend is deployed. Now deploy the frontend:"
echo ""
echo "1. Update .env.production:"
echo "   EXPO_PUBLIC_BACKEND_URL=$API_URL"
echo ""
echo "2. Build frontend:"
echo "   npm run build:production"
echo ""
echo "3. Deploy frontend to your hosting platform:"
echo "   - Web: Deploy to Vercel, Netlify, or S3"
echo "   - iOS: Submit to App Store (eas submit -p ios)"
echo "   - Android: Submit to Play Store (eas submit -p android)"
echo ""

# Step 6: Post-deployment verification
echo -e "${YELLOW}Step 6: Post-Deployment Verification${NC}"
echo "Testing backend endpoint..."
curl -s "$API_URL/stocks?ticker=AAPL&startDate=2024-01-01&endDate=2024-01-31" > /dev/null
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Backend is responding${NC}"
else
    echo -e "${RED}✗ Backend test failed - verify deployment${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Production Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Update frontend .env.production with API URL above"
echo "2. Deploy frontend"
echo "3. Run smoke tests: npm run test:smoke:production"
echo "4. Monitor CloudWatch Logs and Metrics"
echo ""
echo "See docs/deployment/production-deployment.md for detailed instructions."

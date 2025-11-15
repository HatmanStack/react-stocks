#!/bin/bash
#
# CloudWatch Dashboard Deployment Script
#
# Creates or updates the ReactStocksCachePerformance CloudWatch dashboard
# Run: ./scripts/create-dashboard.sh

set -e

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================="
echo "CloudWatch Dashboard Deployment"
echo "========================================="

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo -e "${RED}✗ Error: AWS CLI is not installed${NC}"
    echo "Install it from: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
fi

# Check if AWS credentials are configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo -e "${RED}✗ Error: AWS credentials not configured${NC}"
    echo "Run: aws configure"
    exit 1
fi

# Get AWS region from environment or use default
AWS_REGION=${AWS_REGION:-us-east-1}
echo -e "${YELLOW}Using AWS region: ${AWS_REGION}${NC}"

# Get stack name from samconfig.toml or use default
STACK_NAME=$(grep -A 10 "\[default.deploy.parameters\]" ../samconfig.toml 2>/dev/null | grep "stack_name" | cut -d'"' -f2 || echo "react-stocks")
echo -e "${YELLOW}Using stack name: ${STACK_NAME}${NC}"

# Dashboard name
DASHBOARD_NAME="${STACK_NAME}-CachePerformance"

# Read dashboard JSON and replace placeholders
DASHBOARD_BODY=$(cat cloudwatch-dashboard.json | sed "s/StocksCache/${STACK_NAME}-StocksCache/g" | sed "s/NewsCache/${STACK_NAME}-NewsCache/g" | sed "s/SentimentCache/${STACK_NAME}-SentimentCache/g" | sed "s/SentimentJobs/${STACK_NAME}-SentimentJobs/g")

echo ""
echo "Creating/updating dashboard: ${DASHBOARD_NAME}"

# Create or update the dashboard
aws cloudwatch put-dashboard \
    --dashboard-name "${DASHBOARD_NAME}" \
    --dashboard-body "${DASHBOARD_BODY}" \
    --region "${AWS_REGION}"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Dashboard created/updated successfully${NC}"
    echo ""
    echo "View dashboard at:"
    echo "https://console.aws.amazon.com/cloudwatch/home?region=${AWS_REGION}#dashboards:name=${DASHBOARD_NAME}"
else
    echo -e "${RED}✗ Failed to create/update dashboard${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo "Dashboard Deployment Complete"
echo "========================================="

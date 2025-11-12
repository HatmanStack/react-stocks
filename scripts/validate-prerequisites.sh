#!/bin/bash

# Prerequisite validation script for Phase 1 backend implementation
# Checks for required tools, credentials, and API key availability

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
ALL_CHECKS_PASSED=true

echo "=========================================="
echo "Phase 1 Prerequisite Validation"
echo "=========================================="
echo ""

# Function to print check result
print_check() {
  local name=$1
  local status=$2
  local version=$3

  if [ "$status" = "pass" ]; then
    echo -e "${GREEN}✓${NC} $name ${version:+($version)}"
  elif [ "$status" = "warn" ]; then
    echo -e "${YELLOW}⚠${NC} $name ${version:+($version)}"
  else
    echo -e "${RED}✗${NC} $name"
    ALL_CHECKS_PASSED=false
  fi
}

# Function to check version requirement
check_version() {
  local current=$1
  local required=$2

  # Simple version comparison (works for major.minor.patch)
  if [ "$(printf '%s\n' "$required" "$current" | sort -V | head -n1)" = "$required" ]; then
    return 0
  else
    return 1
  fi
}

echo "Checking required tools..."
echo ""

# Check AWS CLI
if command -v aws &> /dev/null; then
  AWS_VERSION=$(aws --version 2>&1 | cut -d' ' -f1 | cut -d'/' -f2)
  MAJOR_VERSION=$(echo $AWS_VERSION | cut -d'.' -f1)

  if [ "$MAJOR_VERSION" -ge 2 ]; then
    print_check "AWS CLI" "pass" "v$AWS_VERSION"
  else
    print_check "AWS CLI" "fail" "v$AWS_VERSION - requires v2.x+"
  fi
else
  print_check "AWS CLI" "fail"
  echo "  Install: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
fi

# Check AWS credentials
if command -v aws &> /dev/null; then
  if aws sts get-caller-identity &> /dev/null; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    print_check "AWS Credentials" "pass" "Account: $AWS_ACCOUNT"
  else
    print_check "AWS Credentials" "fail"
    echo "  Run: aws configure"
  fi
else
  echo -e "${YELLOW}⚠${NC} AWS Credentials (skipped - AWS CLI not found)"
fi

# Check AWS SAM CLI
if command -v sam &> /dev/null; then
  SAM_VERSION=$(sam --version | grep -oP '(?<=version )\d+\.\d+\.\d+')

  if check_version "$SAM_VERSION" "1.70.0"; then
    print_check "AWS SAM CLI" "pass" "v$SAM_VERSION"
  else
    print_check "AWS SAM CLI" "fail" "v$SAM_VERSION - requires v1.70.0+"
  fi
else
  print_check "AWS SAM CLI" "fail"
  echo "  Install: pip install aws-sam-cli"
  echo "  Or: brew install aws-sam-cli"
fi

# Check Node.js
if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version | cut -d'v' -f2)
  MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

  if [ "$MAJOR_VERSION" -ge 18 ]; then
    print_check "Node.js" "pass" "v$NODE_VERSION"
  else
    print_check "Node.js" "fail" "v$NODE_VERSION - requires v18+"
  fi
else
  print_check "Node.js" "fail"
  echo "  Install: https://nodejs.org/ or use nvm"
fi

# Check npm
if command -v npm &> /dev/null; then
  NPM_VERSION=$(npm --version)
  print_check "npm" "pass" "v$NPM_VERSION"
else
  print_check "npm" "fail"
  echo "  Install Node.js (includes npm)"
fi

# Check Docker (optional)
if command -v docker &> /dev/null; then
  DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+\.\d+')
  print_check "Docker (optional)" "pass" "v$DOCKER_VERSION"
else
  print_check "Docker (optional)" "warn" "Not installed"
  echo "  Docker needed for SAM local testing only"
  echo "  Install: https://docs.docker.com/get-docker/"
fi

echo ""
echo "Checking API key availability..."
echo ""

# Prompt for API keys
read -p "Do you have a valid Tiingo API key? (y/n): " TIINGO_RESPONSE
if [[ "$TIINGO_RESPONSE" =~ ^[Yy]$ ]]; then
  print_check "Tiingo API Key" "pass" "User confirmed"
else
  print_check "Tiingo API Key" "fail"
  echo "  Get key: https://api.tiingo.com"
fi

read -p "Do you have a valid Polygon API key? (y/n): " POLYGON_RESPONSE
if [[ "$POLYGON_RESPONSE" =~ ^[Yy]$ ]]; then
  print_check "Polygon API Key" "pass" "User confirmed"
else
  print_check "Polygon API Key" "fail"
  echo "  Get key: https://polygon.io"
fi

echo ""
echo "=========================================="

if [ "$ALL_CHECKS_PASSED" = true ] && [[ "$TIINGO_RESPONSE" =~ ^[Yy]$ ]] && [[ "$POLYGON_RESPONSE" =~ ^[Yy]$ ]]; then
  echo -e "${GREEN}✓ All prerequisites met!${NC}"
  echo "You're ready to proceed with Phase 1 implementation."
  echo ""
  exit 0
else
  echo -e "${RED}✗ Some prerequisites are missing${NC}"
  echo "Please resolve the issues above before proceeding."
  echo ""
  exit 1
fi

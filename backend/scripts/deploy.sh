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

# Read existing configuration from samconfig.toml
EXISTING_STACK=""
EXISTING_REGION=""
EXISTING_TIINGO=""
EXISTING_FINNHUB=""

if [ -f "samconfig.toml" ]; then
  EXISTING_STACK=$(grep -A 20 "^\[default.deploy.parameters\]" samconfig.toml | grep "^stack_name" | head -n 1 | cut -d '=' -f 2 | tr -d ' "')
  [ -z "$EXISTING_STACK" ] && EXISTING_STACK=$(grep -A 20 "^\[default.global.parameters\]" samconfig.toml | grep "^stack_name" | head -n 1 | cut -d '=' -f 2 | tr -d ' "')

  EXISTING_REGION=$(grep -A 20 "^\[default.deploy.parameters\]" samconfig.toml | grep "^region" | head -n 1 | cut -d '=' -f 2 | tr -d ' "')
  [ -z "$EXISTING_REGION" ] && EXISTING_REGION=$(grep -A 20 "^\[default.global.parameters\]" samconfig.toml | grep "^region" | head -n 1 | cut -d '=' -f 2 | tr -d ' "')

  EXISTING_TIINGO=$(grep "parameter_overrides" samconfig.toml | grep -o 'TiingoApiKey="[^"]*"' | cut -d '"' -f 2)
  EXISTING_FINNHUB=$(grep "parameter_overrides" samconfig.toml | grep -o 'FinnhubApiKey="[^"]*"' | cut -d '"' -f 2)
fi

# Set defaults
DEFAULT_STACK="${EXISTING_STACK:-react-stocks-backend}"
DEFAULT_REGION="${EXISTING_REGION:-us-east-1}"

# Check if API keys are configured
NEED_CONFIG=false
if [ -z "$EXISTING_TIINGO" ] || [ -z "$EXISTING_FINNHUB" ]; then
  NEED_CONFIG=true
fi

# Prompt for configuration if needed
if [ "$NEED_CONFIG" = true ]; then
  echo "Configuration required. Please provide the following:"
  echo ""

  read -p "Stack name [$DEFAULT_STACK]: " STACK_NAME
  STACK_NAME=${STACK_NAME:-$DEFAULT_STACK}

  read -p "AWS Region [$DEFAULT_REGION]: " REGION
  REGION=${REGION:-$DEFAULT_REGION}

  if [ -n "$EXISTING_TIINGO" ]; then
    read -p "Tiingo API key [****${EXISTING_TIINGO: -4}]: " TIINGO_KEY
    TIINGO_KEY=${TIINGO_KEY:-$EXISTING_TIINGO}
  else
    read -p "Tiingo API key: " TIINGO_KEY
  fi

  if [ -n "$EXISTING_FINNHUB" ]; then
    read -p "Finnhub API key [****${EXISTING_FINNHUB: -4}]: " FINNHUB_KEY
    FINNHUB_KEY=${FINNHUB_KEY:-$EXISTING_FINNHUB}
  else
    read -p "Finnhub API key: " FINNHUB_KEY
  fi

  if [ -z "$TIINGO_KEY" ] || [ -z "$FINNHUB_KEY" ]; then
    echo "Error: API keys cannot be empty"
    exit 1
  fi

  echo ""
  echo "Saving configuration to samconfig.toml..."

  # Update samconfig.toml - only update [default.deploy.parameters] section
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "/^\[default.global.parameters\]/,/^\[/ s|^stack_name = .*|stack_name = \"$STACK_NAME\"|" samconfig.toml
    sed -i '' "/^\[default.global.parameters\]/,/^\[/ s|^region = .*|region = \"$REGION\"|" samconfig.toml
    sed -i '' "/^\[default.deploy.parameters\]/,/^\[/ s|^parameter_overrides = .*|parameter_overrides = \"TiingoApiKey=\\\\\"$TIINGO_KEY\\\\\" FinnhubApiKey=\\\\\"$FINNHUB_KEY\\\\\" AllowedOrigins=\\\\\"\*\\\\\"\"|" samconfig.toml
  else
    sed -i "/^\[default.global.parameters\]/,/^\[/ s|^stack_name = .*|stack_name = \"$STACK_NAME\"|" samconfig.toml
    sed -i "/^\[default.global.parameters\]/,/^\[/ s|^region = .*|region = \"$REGION\"|" samconfig.toml
    sed -i "/^\[default.deploy.parameters\]/,/^\[/ s|^parameter_overrides = .*|parameter_overrides = \"TiingoApiKey=\\\\\"$TIINGO_KEY\\\\\" FinnhubApiKey=\\\\\"$FINNHUB_KEY\\\\\" AllowedOrigins=\\\\\"\*\\\\\"\"|" samconfig.toml
  fi

  echo "✓ Configuration saved"
  echo ""
fi

# Extract stack name for later use
STACK_NAME=$(grep -A 20 "^\[default.deploy.parameters\]" samconfig.toml | grep "^stack_name" | head -n 1 | cut -d '=' -f 2 | tr -d ' "')
if [ -z "$STACK_NAME" ]; then
  STACK_NAME=$(grep -A 20 "^\[default.global.parameters\]" samconfig.toml | grep "^stack_name" | head -n 1 | cut -d '=' -f 2 | tr -d ' "')
fi

# Build and deploy
echo "[1/3] Building TypeScript..."
npm run build
echo "✓ Build complete"
echo ""

echo "[2/3] Building SAM package..."
sam build
echo "✓ SAM build complete"
echo ""

echo "[3/3] Deploying to AWS..."
sam deploy
echo "✓ Deployment complete"
echo ""

echo "======================================"
echo "Deployment complete!"
echo "======================================"
echo ""

# Auto-update frontend .env file
if [ -f "./scripts/update-env.sh" ]; then
  ./scripts/update-env.sh "$STACK_NAME"
else
  echo "Note: update-env.sh not found"
fi

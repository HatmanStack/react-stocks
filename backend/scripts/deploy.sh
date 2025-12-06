#!/bin/bash
set -e

cd "$(dirname "$0")/.."

ENV_DEPLOY_FILE=".env.deploy"
ECR_REPO_NAME="distilfinbert"
ML_STACK_NAME_SUFFIX="-ml"

echo "==================================="
echo "React Stocks Backend Deployment"
echo "==================================="
echo ""

# Load from .env.deploy if it exists
if [ -f "$ENV_DEPLOY_FILE" ]; then
    echo "Loading configuration from $ENV_DEPLOY_FILE..."
    export $(grep -v '^#' "$ENV_DEPLOY_FILE" | grep -v '^$' | xargs)
fi

# Get region with default
DEFAULT_REGION="${AWS_REGION:-us-east-1}"
read -p "AWS Region [$DEFAULT_REGION]: " input_region
AWS_REGION="${input_region:-$DEFAULT_REGION}"

# Get stack name with default
DEFAULT_STACK="${STACK_NAME:-stocks-prediction-service}"
read -p "Stack Name [$DEFAULT_STACK]: " input_stack
STACK_NAME="${input_stack:-$DEFAULT_STACK}"

# Get Tiingo API key
if [ -n "$TIINGO_API_KEY" ]; then
    echo "Tiingo API Key: [hidden - press Enter to keep, or paste new key]"
else
    echo "Tiingo API Key: [not set]"
fi
read -p "> " input_tiingo
if [ -n "$input_tiingo" ]; then
    TIINGO_API_KEY="$input_tiingo"
fi
if [ -z "$TIINGO_API_KEY" ]; then
    echo "Error: Tiingo API Key is required"
    exit 1
fi

# Get Finnhub API key
if [ -n "$FINNHUB_API_KEY" ]; then
    echo "Finnhub API Key: [hidden - press Enter to keep, or paste new key]"
else
    echo "Finnhub API Key: [not set]"
fi
read -p "> " input_finnhub
if [ -n "$input_finnhub" ]; then
    FINNHUB_API_KEY="$input_finnhub"
fi
if [ -z "$FINNHUB_API_KEY" ]; then
    echo "Error: Finnhub API Key is required"
    exit 1
fi

# Allowed Origins with default
DEFAULT_ORIGINS="${ALLOWED_ORIGINS:-*}"
read -p "Allowed Origins [$DEFAULT_ORIGINS]: " input_origins
ALLOWED_ORIGINS="${input_origins:-$DEFAULT_ORIGINS}"

# Save configuration to .env.deploy
cat > "$ENV_DEPLOY_FILE" << EOF
# Deployment configuration (auto-saved)
AWS_REGION=$AWS_REGION
STACK_NAME=$STACK_NAME
TIINGO_API_KEY=$TIINGO_API_KEY
FINNHUB_API_KEY=$FINNHUB_API_KEY
ALLOWED_ORIGINS=$ALLOWED_ORIGINS
EOF
# Restrict file permissions - contains sensitive API keys
chmod 600 "$ENV_DEPLOY_FILE"
echo ""
echo "Configuration saved to $ENV_DEPLOY_FILE (permissions: owner read/write only)"

echo ""
echo "Using configuration:"
echo "  Region: $AWS_REGION"
echo "  Stack Name: $STACK_NAME"
echo "  Tiingo Key: ${TIINGO_API_KEY:0:8}..."
echo "  Finnhub Key: ${FINNHUB_API_KEY:0:8}..."
echo "  Allowed Origins: $ALLOWED_ORIGINS"
echo ""

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"

echo "==================================="
echo "Step 1: Build and Push ML Service"
echo "==================================="
echo ""

# Create ECR repository if it doesn't exist
if ! aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$AWS_REGION" 2>/dev/null; then
    echo "Creating ECR repository: $ECR_REPO_NAME"
    aws ecr create-repository --repository-name "$ECR_REPO_NAME" --region "$AWS_REGION"
    BUILD_ML_IMAGE=true
else
    # Check if image exists
    if aws ecr describe-images --repository-name "$ECR_REPO_NAME" --region "$AWS_REGION" --image-ids imageTag=latest 2>/dev/null; then
        echo "ML image already exists in ECR. Skipping build."
        echo "To force rebuild, delete the image or run: docker build -f Dockerfile.ml -t $ECR_REPO_NAME:latest ."
        BUILD_ML_IMAGE=false
    else
        BUILD_ML_IMAGE=true
    fi
fi

if [ "$BUILD_ML_IMAGE" = true ]; then
    # Login to ECR
    echo "Logging into ECR..."
    aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

    # Build Docker image
    echo "Building ML service Docker image..."
    docker build -f Dockerfile.ml -t "$ECR_REPO_NAME:latest" .

    # Tag and push
    echo "Pushing to ECR..."
    docker tag "$ECR_REPO_NAME:latest" "$ECR_URI:latest"
    docker push "$ECR_URI:latest"
fi

echo ""
echo "==================================="
echo "Step 2: Deploy ML Service Stack"
echo "==================================="
echo ""

# Create deployment bucket if needed
DEPLOY_BUCKET="sam-deploy-react-stocks-${AWS_REGION}"
if ! aws s3 ls "s3://${DEPLOY_BUCKET}" --region "$AWS_REGION" 2>/dev/null; then
    echo "Creating deployment bucket: ${DEPLOY_BUCKET}"
    aws s3 mb "s3://${DEPLOY_BUCKET}" --region "$AWS_REGION"
fi

# Deploy ML service
ML_STACK_NAME="${STACK_NAME}${ML_STACK_NAME_SUFFIX}"
sam deploy \
    --template-file ml-template.yaml \
    --stack-name "$ML_STACK_NAME" \
    --region "$AWS_REGION" \
    --s3-bucket "$DEPLOY_BUCKET" \
    --capabilities CAPABILITY_IAM \
    --image-repository "$ECR_URI" \
    --parameter-overrides \
        Environment=prod \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

# Get ML API URL
ML_API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$ML_STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`DistilFinBERTApiUrl`].OutputValue' \
    --output text)

echo ""
echo "ML Service API URL: $ML_API_URL"

echo ""
echo "==================================="
echo "Step 3: Build Main Lambda"
echo "==================================="
echo ""

echo "Building TypeScript..."
npm run build

echo ""
echo "Building SAM application..."
sam build --template template.yaml

echo ""
echo "==================================="
echo "Step 4: Deploy Main Stack"
echo "==================================="
echo ""

# Deploy main stack with ML API URL
sam deploy \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --s3-bucket "$DEPLOY_BUCKET" \
    --capabilities CAPABILITY_IAM \
    --parameter-overrides \
        TiingoApiKey="$TIINGO_API_KEY" \
        FinnhubApiKey="$FINNHUB_API_KEY" \
        AllowedOrigins="$ALLOWED_ORIGINS" \
        DistilFinBERTApiUrl="$ML_API_URL" \
    --no-confirm-changeset \
    --no-fail-on-empty-changeset

echo ""
echo "==================================="
echo "Deployment Complete!"
echo "==================================="
echo ""

# Get API Gateway URL
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`ReactStocksApiUrl`].OutputValue' \
    --output text)

if [ -z "$API_URL" ] || [ "$API_URL" = "None" ]; then
    echo "Warning: Could not retrieve API URL from stack outputs"
    exit 0
fi

echo "Main API URL: $API_URL"
echo "ML API URL: $ML_API_URL"
echo ""

# Update frontend .env file (cross-platform sed)
FRONTEND_ENV="../frontend/.env"
if [ -f "$FRONTEND_ENV" ]; then
    # Update EXPO_PUBLIC_BACKEND_URL
    if grep -q "^EXPO_PUBLIC_BACKEND_URL=" "$FRONTEND_ENV"; then
        # Use temp file for cross-platform compatibility (macOS sed -i requires extension)
        sed "s|^EXPO_PUBLIC_BACKEND_URL=.*|EXPO_PUBLIC_BACKEND_URL=$API_URL|" "$FRONTEND_ENV" > "$FRONTEND_ENV.tmp" && mv "$FRONTEND_ENV.tmp" "$FRONTEND_ENV"
    else
        echo "EXPO_PUBLIC_BACKEND_URL=$API_URL" >> "$FRONTEND_ENV"
    fi
else
    echo "EXPO_PUBLIC_BACKEND_URL=$API_URL" > "$FRONTEND_ENV"
fi

echo "Updated frontend .env with API URL"
echo ""
echo "EXPO_PUBLIC_BACKEND_URL=$API_URL"

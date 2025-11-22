#!/bin/bash
#
# DistilFinBERT Service Deployment Script
#
# This script:
# 1. Builds Docker image for Lambda
# 2. Pushes to Amazon ECR
# 3. Deploys with AWS SAM
# 4. Outputs API Gateway URL
#
# Prerequisites:
# - AWS CLI configured with credentials
# - SAM CLI installed
# - Docker running
# - Appropriate IAM permissions

set -e  # Exit on error

# Configuration
SERVICE_NAME="distilfinbert"
IMAGE_NAME="${SERVICE_NAME}"
ENVIRONMENT="${ENVIRONMENT:-prod}"  # Default to prod if not set
AWS_REGION="${AWS_REGION:-us-east-1}"  # Default to us-east-1

echo "=========================================="
echo "DistilFinBERT Deployment"
echo "=========================================="
echo "Environment: ${ENVIRONMENT}"
echo "Region: ${AWS_REGION}"
echo ""

# Get AWS account ID
echo "Getting AWS account ID..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo "Account ID: ${AWS_ACCOUNT_ID}"
echo ""

# ECR repository URL
ECR_REPOSITORY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${IMAGE_NAME}"

# Step 1: Create ECR repository if it doesn't exist
echo "Step 1: Checking ECR repository..."
if ! aws ecr describe-repositories --repository-names ${IMAGE_NAME} --region ${AWS_REGION} > /dev/null 2>&1; then
    echo "Creating ECR repository: ${IMAGE_NAME}"
    aws ecr create-repository \
        --repository-name ${IMAGE_NAME} \
        --region ${AWS_REGION} \
        --image-scanning-configuration scanOnPush=true \
        --tags Key=Service,Value=${SERVICE_NAME} Key=Environment,Value=${ENVIRONMENT}
    echo "ECR repository created"
else
    echo "ECR repository already exists"
fi
echo ""

# Step 2: Authenticate Docker to ECR
echo "Step 2: Authenticating Docker to ECR..."
aws ecr get-login-password --region ${AWS_REGION} | \
    docker login --username AWS --password-stdin ${ECR_REPOSITORY}
echo "Docker authenticated to ECR"
echo ""

# Step 3: Build Docker image
echo "Step 3: Building Docker image..."
docker build -t ${IMAGE_NAME}:latest -f Dockerfile .
echo "Docker image built"
echo ""

# Step 4: Tag image for ECR
echo "Step 4: Tagging image..."
docker tag ${IMAGE_NAME}:latest ${ECR_REPOSITORY}:latest
docker tag ${IMAGE_NAME}:latest ${ECR_REPOSITORY}:$(date +%Y%m%d-%H%M%S)
echo "Image tagged"
echo ""

# Step 5: Push image to ECR
echo "Step 5: Pushing image to ECR..."
docker push ${ECR_REPOSITORY}:latest
echo "Image pushed to ECR"
echo ""

# Step 6: Deploy with SAM
echo "Step 6: Deploying with SAM..."
if [ ! -f samconfig.toml ]; then
    echo "No samconfig.toml found. Running guided deployment..."
    sam deploy \
        --guided \
        --template-file template.yaml \
        --stack-name distilfinbert-${ENVIRONMENT} \
        --parameter-overrides Environment=${ENVIRONMENT} \
        --region ${AWS_REGION} \
        --capabilities CAPABILITY_IAM \
        --tags Service=${SERVICE_NAME} Environment=${ENVIRONMENT}
else
    echo "Using existing samconfig.toml..."
    sam deploy \
        --template-file template.yaml \
        --stack-name distilfinbert-${ENVIRONMENT} \
        --parameter-overrides Environment=${ENVIRONMENT} \
        --region ${AWS_REGION} \
        --capabilities CAPABILITY_IAM \
        --tags Service=${SERVICE_NAME} Environment=${ENVIRONMENT} \
        --no-confirm-changeset
fi
echo ""

# Step 7: Get outputs
echo "Step 7: Retrieving deployment outputs..."
API_URL=$(aws cloudformation describe-stacks \
    --stack-name distilfinbert-${ENVIRONMENT} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`DistilFinBERTApiUrl`].OutputValue' \
    --output text)

FUNCTION_NAME=$(aws cloudformation describe-stacks \
    --stack-name distilfinbert-${ENVIRONMENT} \
    --region ${AWS_REGION} \
    --query 'Stacks[0].Outputs[?OutputKey==`FunctionName`].OutputValue' \
    --output text)

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "API URL: ${API_URL}"
echo "Function Name: ${FUNCTION_NAME}"
echo ""
echo "Test the deployment:"
echo "  curl ${API_URL}/health"
echo ""
echo "View logs:"
echo "  sam logs --stack-name distilfinbert-${ENVIRONMENT} --tail"
echo ""
echo "Update backend environment:"
echo "  export DISTILFINBERT_API_URL=${API_URL}"
echo "=========================================="

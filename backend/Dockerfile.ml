# DistilFinBERT Service Dockerfile for AWS Lambda
#
# This Dockerfile creates a container image for running DistilFinBERT
# sentiment analysis as an AWS Lambda function.

# Use AWS Lambda Python 3.13 base image
FROM public.ecr.aws/lambda/python:3.13

# Set environment variables
ENV MODEL_NAME=ProsusAI/finbert \
    MODEL_CACHE_DIR=/tmp/models \
    LOG_LEVEL=INFO \
    PYTHONUNBUFFERED=1

# Copy requirements and install dependencies
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# Copy application code
COPY services/ml/ ${LAMBDA_TASK_ROOT}/services/ml/

# Lambda handler
CMD ["services.ml.handler.handler"]

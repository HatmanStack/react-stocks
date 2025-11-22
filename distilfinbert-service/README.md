# DistilFinBERT Sentiment Analysis Service

Financial sentiment analysis microservice using DistilFinBERT transformer model. Deployed as AWS Lambda function with API Gateway HTTP API.

## Overview

This service provides sophisticated contextual sentiment analysis for financial news articles using the ProsusAI/FinBERT model. It's designed to integrate with the multi-signal sentiment analysis system, providing the most accurate signal for material financial events (earnings, M&A, guidance, analyst ratings).

## Features

- **Transformer-based analysis**: Uses DistilFinBERT for contextual understanding
- **Fast inference**: <500ms warm response time, optimized for Lambda
- **Batch processing**: Analyze up to 10 texts in a single request
- **Health monitoring**: Built-in health check endpoint
- **Model caching**: Global model cache for warm Lambda starts
- **Comprehensive logging**: Detailed request/response logging for debugging

## API Endpoints

### POST /sentiment

Analyze sentiment of a single financial text.

**Request:**
```json
{
  "text": "Apple reports record quarterly earnings, beating estimates by 15%"
}
```

**Response:**
```json
{
  "sentiment": 0.8542,
  "confidence": 0.9234,
  "label": "positive",
  "probabilities": {
    "negative": 0.0312,
    "neutral": 0.0454,
    "positive": 0.9234
  }
}
```

### POST /sentiment/batch

Analyze multiple texts (max 10).

**Request:**
```json
{
  "texts": [
    "Earnings beat expectations",
    "Stock drops on guidance miss"
  ]
}
```

**Response:**
```json
{
  "results": [
    {
      "sentiment": 0.75,
      "confidence": 0.88,
      "label": "positive",
      "probabilities": {...}
    },
    {
      "sentiment": -0.65,
      "confidence": 0.82,
      "label": "negative",
      "probabilities": {...}
    }
  ],
  "count": 2
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "model_loaded": true,
  "model_info": {
    "model_name": "ProsusAI/finbert",
    "cache_dir": "/tmp/models",
    "max_length": "512",
    "device": "cpu",
    "loaded": "true"
  }
}
```

## Local Development

### Prerequisites

- Python 3.9+
- Docker 20.0+
- 5GB free disk space (for model download)

### Installation

1. **Clone and enter directory:**
   ```bash
   cd distilfinbert-service
   ```

2. **Create virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Linux/Mac
   venv\Scripts\activate     # Windows
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

### Running Locally

#### Option 1: Docker (Recommended)

```bash
# Build image
docker build -t distilfinbert-local -f Dockerfile.local .

# Run service
docker run -p 8000:8000 distilfinbert-local
```

#### Option 2: Direct with uvicorn

```bash
# Set environment variables
export MODEL_NAME=ProsusAI/finbert
export MODEL_CACHE_DIR=./models
export LOG_LEVEL=INFO

# Run with uvicorn
uvicorn app.app:app --host 0.0.0.0 --port 8000 --reload
```

### Testing

Once service is running:

```bash
# Run test script
python test_local.py

# Or test manually with curl
curl -X POST http://localhost:8000/sentiment \
  -H "Content-Type: application/json" \
  -d '{"text":"Earnings beat expectations"}'
```

## AWS Lambda Deployment

See deployment guide in Task 2 implementation or run:

```bash
./deploy.sh
```

The deployment script:
1. Builds Docker image for Lambda
2. Pushes to Amazon ECR
3. Deploys with SAM
4. Outputs API Gateway URL

## Performance Characteristics

- **Cold start**: 5-10 seconds (model download on first invocation)
- **Warm response**: <500ms (model cached in Lambda memory)
- **Model size**: ~250MB (DistilFinBERT)
- **Memory requirement**: 2048MB Lambda memory
- **Timeout**: 30 seconds

## Configuration

Environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `MODEL_NAME` | HuggingFace model identifier | `ProsusAI/finbert` |
| `MODEL_CACHE_DIR` | Model cache directory | `/tmp/models` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `MAX_TEXT_LENGTH` | Max tokens for model | `512` |

## Architecture

```
API Gateway HTTP API
    ↓
Lambda Function (Python 3.9, 2GB memory)
    ↓
FastAPI (via Mangum adapter)
    ↓
DistilFinBERT Model (ProsusAI/finbert)
    ↓
PyTorch Inference (CPU)
```

## Model Details

- **Base model**: DistilBERT (distilled BERT)
- **Fine-tuning**: Financial news sentiment (FinBERT)
- **Provider**: ProsusAI (huggingface.co/ProsusAI/finbert)
- **Classes**: Negative, Neutral, Positive
- **Output**: Continuous score from -1 (negative) to +1 (positive)

## Integration with Backend

The Node.js Lambda backend calls this service via HTTP:

```typescript
// backend/src/services/distilFinBERT.service.ts
const response = await axios.post(DISTILFINBERT_API_URL + '/sentiment', {
  text: articleText
});

const sentimentScore = response.data.sentiment; // -1 to +1
```

Results are cached in DynamoDB to minimize API calls and reduce cost.

## Troubleshooting

### Model fails to load

- Check Lambda memory is set to 2048MB
- Verify `/tmp` has sufficient space (1024MB ephemeral storage)
- Check CloudWatch logs for detailed error messages

### Slow responses

- First request is slow (cold start) - subsequent requests fast
- Use provisioned concurrency if cold starts are problematic
- Check model is being cached (see health endpoint)

### Out of memory errors

- Increase Lambda memory to 3008MB
- Reduce batch size
- Check for memory leaks in model caching

## Cost Estimation

Assuming 10,000 requests/day with 80% cache hit rate:

- Lambda invocations: 2,000/day
- Duration: ~500ms average (warm starts)
- Memory: 2048MB
- **Estimated cost**: ~$5-10/month

(Cache hits don't invoke this service)

## Development

### Adding features

1. Update `app/model.py` for model changes
2. Update `app/app.py` for API changes
3. Test locally with `test_local.py`
4. Deploy with `deploy.sh`

### Running tests

```bash
# Unit tests (TODO: implement)
pytest tests/

# Integration tests
python test_local.py
```

## License

MIT

## Support

For issues related to:
- **Model performance**: Check ProsusAI/finbert documentation
- **Lambda deployment**: See AWS SAM documentation
- **API integration**: See backend integration guide

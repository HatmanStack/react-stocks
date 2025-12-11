"""
Local Testing Script for ML Sentiment Service

Tests the sentiment analysis endpoints with sample financial texts.
Run after starting the service with Docker.

Usage:
    python test_integration.py
"""

import requests
import time
from typing import Dict, Any

# Service URL (adjust if needed)
BASE_URL = "http://localhost:8000"

# Test cases with expected sentiments
TEST_CASES = [
    {
        "text": "Apple reports record quarterly earnings, beating analyst estimates by 15%",
        "expected": "positive",
        "description": "Strong earnings beat"
    },
    {
        "text": "Company misses revenue expectations, stock drops 10% in after-hours trading",
        "expected": "negative",
        "description": "Revenue miss"
    },
    {
        "text": "Quarterly results in line with expectations, guidance unchanged",
        "expected": "neutral",
        "description": "In-line results"
    },
    {
        "text": "Merger approved by shareholders, expected to close next quarter",
        "expected": "positive",
        "description": "M&A approval"
    },
    {
        "text": "CEO departure announced amid ongoing investigation",
        "expected": "negative",
        "description": "Leadership crisis"
    }
]


def test_health() -> bool:
    """Test health endpoint"""
    print("Testing /health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        response.raise_for_status()
        data = response.json()

        print(f"  Status: {data['status']}")
        print(f"  Model loaded: {data['model_loaded']}")
        print(f"  Model: {data['model_info']['model_name']}")
        print("  ✓ Health check passed\n")
        return True
    except Exception as e:
        print(f"  ✗ Health check failed: {e}\n")
        return False


def test_sentiment(text: str, expected: str, description: str) -> Dict[str, Any]:
    """Test single sentiment analysis"""
    print(f"Testing: {description}")
    print(f"  Text: {text[:80]}...")

    try:
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/sentiment",
            json={"text": text},
            timeout=30
        )
        elapsed_ms = (time.time() - start_time) * 1000

        response.raise_for_status()
        data = response.json()

        # Check results
        sentiment_score = data['sentiment']
        label = data['label']
        confidence = data['confidence']

        # Validate score range
        if not -1 <= sentiment_score <= 1:
            print(f"  ✗ Invalid sentiment score: {sentiment_score}")
            return {"success": False}

        # Check if label matches expected
        match = "✓" if label == expected else "✗"
        print(f"  {match} Sentiment: {label} (score: {sentiment_score:.4f}, confidence: {confidence:.4f})")
        print(f"  Probabilities: {data['probabilities']}")
        print(f"  Response time: {elapsed_ms:.0f}ms\n")

        return {
            "success": True,
            "expected_match": label == expected,
            "sentiment": sentiment_score,
            "label": label,
            "confidence": confidence,
            "response_time_ms": elapsed_ms
        }

    except Exception as e:
        print(f"  ✗ Request failed: {e}\n")
        return {"success": False}


def test_batch() -> bool:
    """Test batch sentiment analysis"""
    print("Testing /sentiment/batch endpoint...")

    texts = [case["text"] for case in TEST_CASES[:3]]

    try:
        start_time = time.time()
        response = requests.post(
            f"{BASE_URL}/sentiment/batch",
            json={"texts": texts},
            timeout=60
        )
        elapsed_ms = (time.time() - start_time) * 1000

        response.raise_for_status()
        data = response.json()

        print(f"  Processed {data['count']} texts")
        print(f"  Total time: {elapsed_ms:.0f}ms")
        print(f"  Avg time per text: {elapsed_ms/data['count']:.0f}ms")

        for i, result in enumerate(data['results']):
            print(f"    {i+1}. {result['label']} (score: {result['sentiment']:.4f})")

        print("  ✓ Batch processing passed\n")
        return True

    except Exception as e:
        print(f"  ✗ Batch processing failed: {e}\n")
        return False


def main():
    """Run all tests"""
    print("=" * 80)
    print("ML Sentiment Service Local Test")
    print("=" * 80)
    print()

    # Test health endpoint
    if not test_health():
        print("Service not healthy. Make sure it's running:")
        print("  cd backend/services/ml")
        print("  pip install -r ../../requirements.txt")
        print("  uvicorn app:app --host 0.0.0.0 --port 8000")
        return

    # Test individual sentiment analyses
    results = []
    for case in TEST_CASES:
        result = test_sentiment(case["text"], case["expected"], case["description"])
        if result["success"]:
            results.append(result)

    # Test batch endpoint
    test_batch()

    # Summary
    print("=" * 80)
    print("Test Summary")
    print("=" * 80)

    if results:
        successful = len([r for r in results if r["success"]])
        matched = len([r for r in results if r.get("expected_match", False)])
        avg_time = sum(r["response_time_ms"] for r in results) / len(results)
        avg_confidence = sum(r["confidence"] for r in results) / len(results)

        print(f"Tests run: {successful}/{len(TEST_CASES)}")
        print(f"Expected sentiment matched: {matched}/{successful}")
        print(f"Average response time: {avg_time:.0f}ms")
        print(f"Average confidence: {avg_confidence:.4f}")
    else:
        print("No tests completed successfully")

    print()


if __name__ == "__main__":
    main()

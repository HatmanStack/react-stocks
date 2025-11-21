"""
Model Loading and Inference Module

Handles loading DistilFinBERT model and performing sentiment inference.
Model is cached globally for Lambda reuse (warm starts).
"""

import os
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from typing import Dict, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model cache (survives Lambda warm starts)
_tokenizer: Optional[AutoTokenizer] = None
_model: Optional[AutoModelForSequenceClassification] = None

# Configuration from environment
MODEL_NAME = os.getenv('MODEL_NAME', 'ProsusAI/finbert')
MODEL_CACHE_DIR = os.getenv('MODEL_CACHE_DIR', '/tmp/models')
MAX_TEXT_LENGTH = 512


def load_model() -> tuple[AutoTokenizer, AutoModelForSequenceClassification]:
    """
    Load DistilFinBERT model and tokenizer.

    Model is cached in global variables to enable reuse across Lambda invocations.
    First call downloads model (~250MB), subsequent calls use cached version.

    Returns:
        Tuple of (tokenizer, model)

    Raises:
        RuntimeError: If model loading fails
    """
    global _tokenizer, _model

    # Return cached model if already loaded
    if _tokenizer is not None and _model is not None:
        logger.info(f"Using cached model: {MODEL_NAME}")
        return _tokenizer, _model

    try:
        logger.info(f"Loading model: {MODEL_NAME}")
        logger.info(f"Cache directory: {MODEL_CACHE_DIR}")

        # Create cache directory if needed
        os.makedirs(MODEL_CACHE_DIR, exist_ok=True)

        # Load tokenizer
        logger.info("Loading tokenizer...")
        _tokenizer = AutoTokenizer.from_pretrained(
            MODEL_NAME,
            cache_dir=MODEL_CACHE_DIR
        )

        # Load model
        logger.info("Loading model weights...")
        _model = AutoModelForSequenceClassification.from_pretrained(
            MODEL_NAME,
            cache_dir=MODEL_CACHE_DIR
        )

        # Set model to evaluation mode (disable dropout, etc.)
        _model.eval()

        # Move to CPU (Lambda doesn't have GPU)
        _model.to('cpu')

        logger.info("Model loaded successfully")
        return _tokenizer, _model

    except Exception as error:
        logger.error(f"Failed to load model: {error}")
        raise RuntimeError(f"Model loading failed: {str(error)}")


def analyze_sentiment(text: str) -> Dict[str, float]:
    """
    Analyze sentiment of financial text using DistilFinBERT.

    Process:
    1. Tokenize input text (max 512 tokens)
    2. Run model inference
    3. Apply softmax to get probabilities
    4. Convert to continuous score: positive_prob - negative_prob

    Args:
        text: Financial news text to analyze

    Returns:
        Dictionary with:
        - sentiment: Score from -1 (negative) to +1 (positive)
        - confidence: Max probability (0 to 1)
        - label: Classification label (positive/negative/neutral)
        - probabilities: Dict of {negative, neutral, positive} probabilities

    Raises:
        ValueError: If text is empty or None
        RuntimeError: If inference fails

    Example:
        >>> analyze_sentiment("Earnings beat expectations by 15%")
        {
            'sentiment': 0.85,
            'confidence': 0.92,
            'label': 'positive',
            'probabilities': {'negative': 0.03, 'neutral': 0.05, 'positive': 0.92}
        }
    """
    # Validate input
    if not text or not text.strip():
        raise ValueError("Text cannot be empty")

    # Truncate if too long (log warning)
    if len(text) > MAX_TEXT_LENGTH * 4:  # Rough character estimate
        logger.warning(f"Text truncated from {len(text)} to ~{MAX_TEXT_LENGTH * 4} characters")
        text = text[:MAX_TEXT_LENGTH * 4]

    try:
        # Load model (uses cache if already loaded)
        tokenizer, model = load_model()

        # Tokenize input
        inputs = tokenizer(
            text,
            return_tensors='pt',
            truncation=True,
            max_length=MAX_TEXT_LENGTH,
            padding=True
        )

        # Run inference (no gradient computation)
        with torch.no_grad():
            outputs = model(**inputs)
            logits = outputs.logits

        # Apply softmax to get probabilities
        probabilities = torch.nn.functional.softmax(logits, dim=-1)[0]

        # FinBERT outputs: [negative, neutral, positive]
        neg_prob = probabilities[0].item()
        neut_prob = probabilities[1].item()
        pos_prob = probabilities[2].item()

        # Convert to continuous score (-1 to +1)
        sentiment_score = pos_prob - neg_prob

        # Confidence is max probability
        confidence = max(neg_prob, neut_prob, pos_prob)

        # Label is highest probability class
        if pos_prob == max(neg_prob, neut_prob, pos_prob):
            label = 'positive'
        elif neg_prob == max(neg_prob, neut_prob, pos_prob):
            label = 'negative'
        else:
            label = 'neutral'

        return {
            'sentiment': round(sentiment_score, 4),
            'confidence': round(confidence, 4),
            'label': label,
            'probabilities': {
                'negative': round(neg_prob, 4),
                'neutral': round(neut_prob, 4),
                'positive': round(pos_prob, 4)
            }
        }

    except Exception as error:
        logger.error(f"Sentiment analysis failed: {error}")
        raise RuntimeError(f"Inference failed: {str(error)}")


def get_model_info() -> Dict[str, str]:
    """
    Get information about loaded model.

    Returns:
        Dictionary with model metadata
    """
    return {
        'model_name': MODEL_NAME,
        'cache_dir': MODEL_CACHE_DIR,
        'max_length': str(MAX_TEXT_LENGTH),
        'device': 'cpu',
        'loaded': _model is not None
    }

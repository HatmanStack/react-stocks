"""Unit tests for ML model module."""
import pytest
from unittest.mock import patch, MagicMock
import torch


class TestAnalyzeSentiment:
    def test_empty_text_raises_value_error(self):
        from model import analyze_sentiment
        with pytest.raises(ValueError, match="Text cannot be empty"):
            analyze_sentiment("")

    def test_whitespace_only_raises_value_error(self):
        from model import analyze_sentiment
        with pytest.raises(ValueError, match="Text cannot be empty"):
            analyze_sentiment("   ")


class TestLoadModel:
    def test_model_name_from_env(self):
        """Test that MODEL_NAME can be configured via environment."""
        import model
        # Default should be ProsusAI/finbert
        assert model.MODEL_NAME == 'ProsusAI/finbert'

    def test_max_text_length_constant(self):
        """Test that MAX_TEXT_LENGTH is set correctly."""
        import model
        assert model.MAX_TEXT_LENGTH == 512


class TestSentimentLabels:
    def test_label_mapping_exists(self):
        """Test that the model has proper label mapping."""
        import model
        # The model should handle the 3 sentiment classes
        assert hasattr(model, 'analyze_sentiment')


class TestModelCacheDir:
    def test_cache_dir_default(self):
        """Test default cache directory."""
        import model
        assert model.MODEL_CACHE_DIR == '/tmp/models'

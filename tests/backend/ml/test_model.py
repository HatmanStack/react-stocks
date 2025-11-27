"""Unit tests for ML model module."""
import pytest
import model
from model import analyze_sentiment


class TestAnalyzeSentiment:
    def test_empty_text_raises_value_error(self):
        with pytest.raises(ValueError, match="Text cannot be empty"):
            analyze_sentiment("")

    def test_whitespace_only_raises_value_error(self):
        with pytest.raises(ValueError, match="Text cannot be empty"):
            analyze_sentiment("   ")


class TestModelConfiguration:
    def test_model_name_default(self):
        """Test that MODEL_NAME defaults to ProsusAI/finbert."""
        assert model.MODEL_NAME == 'ProsusAI/finbert'

    def test_max_text_length_constant(self):
        """Test that MAX_TEXT_LENGTH is set correctly."""
        assert model.MAX_TEXT_LENGTH == 512

    def test_cache_dir_default(self):
        """Test default cache directory."""
        assert model.MODEL_CACHE_DIR == '/tmp/models'

    def test_analyze_sentiment_exists(self):
        """Test that analyze_sentiment function is exported."""
        assert callable(analyze_sentiment)

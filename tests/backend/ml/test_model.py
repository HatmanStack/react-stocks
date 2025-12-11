import pytest
from unittest.mock import MagicMock, patch
import numpy as np
import os

# Mock dependencies before importing the module under test
with patch.dict('sys.modules', {
    'onnxruntime': MagicMock(),
    'transformers': MagicMock(),
    'boto3': MagicMock(),
    'tokenizers': MagicMock(),
}):
    # Import the module under test after setting up mocks
    from backend.services.ml import model_onnx as module_under_test

@pytest.fixture
def mock_onnx_session_instance():
    """Returns a mock ONNX inference session instance."""
    mock_session = MagicMock()
    # Mock run method to return probabilities
    # Use logits [0.5, 1.0, 1.5] -> softmax -> [0.1863, 0.3072, 0.5065] (neg, neut, pos)
    mock_session.run.return_value = [np.array([[0.5, 1.0, 1.5]], dtype=np.float32)]
    return mock_session

@pytest.fixture
def mock_tokenizer_instance():
    """Returns a mock Tokenizer instance."""
    mock_tokenizer = MagicMock()
    mock_tokenizer.encode.return_value = MagicMock(ids=[0]*10, attention_mask=[1]*10)
    mock_tokenizer.enable_padding = MagicMock()
    mock_tokenizer.enable_truncation = MagicMock()
    return mock_tokenizer

@pytest.fixture(autouse=True)
def mock_global_ml_objects(mock_onnx_session_instance, mock_tokenizer_instance):
    """
    Patches the global _session and _tokenizer in model_onnx.py
    and the load_model function to return these mocks.
    """
    with patch.object(module_under_test, '_session', new=mock_onnx_session_instance), \
         patch.object(module_under_test, '_tokenizer', new=mock_tokenizer_instance), \
         patch('backend.services.ml.model_onnx.load_model', return_value=(mock_onnx_session_instance, mock_tokenizer_instance)):
        yield

class TestAnalyzeSentiment:
    def test_empty_text_raises_value_error(self):
        """Test that empty text raises ValueError"""
        with pytest.raises(ValueError, match="Text cannot be empty"):
            module_under_test.analyze_sentiment("")
            
    def test_whitespace_only_raises_value_error(self):
        """Test that whitespace-only text raises ValueError"""
        with pytest.raises(ValueError, match="Text cannot be empty"):
            module_under_test.analyze_sentiment("   ")

    def test_successful_inference(self, mock_onnx_session_instance, mock_tokenizer_instance):
        """Test successful inference path"""
        text_input = "Stock prices rose significantly"
        
        # Expected values based on mock_onnx_session_instance returning logits [0.5, 1.0, 1.5]
        # Softmax calculation:
        logits = np.array([0.5, 1.0, 1.5])
        exp_logits = np.exp(logits - np.max(logits)) # exp([-1.0, -0.5, 0.0]) = [0.36787944, 0.60653066, 1.        ]
        probs = exp_logits / np.sum(exp_logits) # [0.1863806 , 0.30720498, 0.50641442] (neg, neut, pos)

        expected_neg_prob = round(probs[0], 4)
        expected_pos_prob = round(probs[2], 4)
        expected_sentiment = round(expected_pos_prob - expected_neg_prob, 4) # 0.5064 - 0.1864 = 0.3200
        expected_confidence = round(np.max(probs), 4) # 0.5064
        expected_label = 'positive' # LABELS[2]

        # Call function
        result = module_under_test.analyze_sentiment(text_input)
        
        # Verify result structure
        assert 'sentiment' in result
        assert 'confidence' in result
        assert 'probabilities' in result
        assert 'label' in result
        
        # Verify values from our mock
        assert result['sentiment'] == expected_sentiment
        assert result['label'] == expected_label
        assert result['confidence'] == expected_confidence
        
        # Verify interactions
        mock_tokenizer_instance.encode.assert_called_with(text_input)
        mock_onnx_session_instance.run.assert_called_once()

    def test_error_handling_during_inference(self, mock_onnx_session_instance, mock_tokenizer_instance):
        """Test error handling when inference fails"""
        # Make session run fail with RuntimeError
        mock_onnx_session_instance.run.side_effect = RuntimeError("ONNX Runtime Error")
        
        with pytest.raises(RuntimeError, match="ONNX Runtime Error"):
            module_under_test.analyze_sentiment("Valid text")

class TestModelConstants:
    def test_max_text_length_constant(self):
        """Verify max text length constant"""
        assert module_under_test.MAX_LENGTH == 512
        
    def test_s3_bucket_constant(self):
        """Verify S3 bucket constant"""
        # Default value from model_onnx.py if not set in environment
        assert module_under_test.S3_BUCKET == os.getenv("ML_MODEL_BUCKET", "react-stocks-ml-models")

    def test_onnx_model_key_constant(self):
        """Verify ONNX model key constant"""
        assert module_under_test.ONNX_MODEL_KEY == os.getenv("ONNX_MODEL_KEY", "models/distilroberta-financial.onnx")

    def test_tokenizer_key_constant(self):
        """Verify tokenizer key constant"""
        assert module_under_test.TOKENIZER_KEY == os.getenv("TOKENIZER_KEY", "models/tokenizer/tokenizer.json")

    def test_labels_constant(self):
        """Verify LABELS constant"""
        assert module_under_test.LABELS == ["negative", "neutral", "positive"]

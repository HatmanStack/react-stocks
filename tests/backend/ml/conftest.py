"""Pytest configuration for ML tests."""
import sys
from pathlib import Path

# Add the ML service path to sys.path so we can import model
ML_SERVICE_PATH = Path(__file__).parent.parent.parent.parent / "backend" / "services" / "ml"
sys.path.insert(0, str(ML_SERVICE_PATH))

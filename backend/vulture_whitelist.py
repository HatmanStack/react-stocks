# Vulture whitelist - items that appear unused but are actually entry points or fixtures

# Lambda handler entry points (called by AWS, appear unused locally)
handler  # backend/python/index.py

# pytest fixtures (called by pytest, not directly)
api_event  # backend/python_tests/conftest.py

# Lambda handler parameters required by AWS signature
context  # Lambda context parameter (required but often unused)

# Classmethod first parameter
cls  # @classmethod decorator requires cls parameter

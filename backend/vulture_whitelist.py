# Vulture whitelist - items that appear unused but are actually entry points or fixtures

# Lambda handler entry points (called by AWS, appear unused locally)
handler  # backend/python/index.py
lambda_handler  # alternative Lambda entry point name

# Flask/WSGI entry points (ML service)
app  # backend/services/ml/app.py
create_app  # factory pattern

# pytest fixtures (called by pytest, not directly)
api_event  # backend/python_tests/conftest.py

# Type annotations and schemas that appear unused but are needed
StockSearchItem  # schemas/stock_types.py
StockQuote  # schemas/stock_types.py
StockInfo  # schemas/stock_types.py
StockBatchResponse  # schemas/stock_types.py

# Lambda handler parameters required by AWS signature
context  # Lambda context parameter (required but often unused)

# Classmethod first parameter
cls  # @classmethod decorator requires cls parameter

"""
AWS Lambda Handler

Adapts FastAPI application to handle Lambda/API Gateway events using Mangum.
"""

import os
import logging
from mangum import Mangum
from .app import app

# Configure logging for Lambda
logging.basicConfig(
    level=os.getenv('LOG_LEVEL', 'INFO'),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

# Create Lambda handler by wrapping FastAPI app with Mangum
# Mangum converts API Gateway events to ASGI requests
handler = Mangum(app, lifespan="off")

logger.info("Lambda handler initialized")

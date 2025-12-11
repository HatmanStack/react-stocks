"""
Lambda entry point for yfinance stock data service.
Routes requests to appropriate handlers based on path and method.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def handler(event: dict[str, Any], context: Any) -> dict[str, Any]:
    """
    Lambda handler - routes requests to appropriate handler functions.

    Args:
        event: API Gateway event (format version 2.0)
        context: Lambda context

    Returns:
        API Gateway response
    """
    # Import handlers here to avoid circular imports and improve cold start
    from handlers.stocks import handle_stocks_request
    from handlers.search import handle_search_request
    from handlers.batch import handle_batch_stocks_request
    from utils.response import error_response

    # Extract path and method from event
    raw_path = event.get("rawPath", "")
    request_context = event.get("requestContext", {})
    http_info = request_context.get("http", {})
    method = http_info.get("method", "GET")

    logger.info(f"[Router] {method} {raw_path}")

    try:
        # Route to appropriate handler
        if raw_path == "/stocks" and method == "GET":
            return handle_stocks_request(event)

        elif raw_path == "/search" and method == "GET":
            return handle_search_request(event)

        elif raw_path == "/batch/stocks" and method == "POST":
            return handle_batch_stocks_request(event)

        else:
            logger.warning(f"[Router] Unknown route: {method} {raw_path}")
            return error_response(f"Not found: {method} {raw_path}", 404)

    except Exception as e:
        logger.error(f"[Router] Unhandled error: {e}", exc_info=True)
        return error_response("Internal server error", 500)

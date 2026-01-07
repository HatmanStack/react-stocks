"""
Type definitions for stock data matching Tiingo API contracts.
"""

from typing import TypedDict


class TiingoStockPrice(TypedDict):
    """Stock price data matching Tiingo API format."""

    date: str  # ISO 8601 format "2025-01-15T00:00:00.000Z"
    open: float
    high: float
    low: float
    close: float
    volume: int
    adjOpen: float
    adjHigh: float
    adjLow: float
    adjClose: float
    adjVolume: int
    divCash: float
    splitFactor: float


class TiingoSymbolMetadata(TypedDict):
    """Company metadata matching Tiingo API format."""

    ticker: str
    name: str
    exchangeCode: str
    startDate: str
    endDate: str
    description: str


class TiingoSearchResult(TypedDict):
    """Search result matching Tiingo API format."""

    ticker: str
    name: str
    assetType: str  # "Stock", "ETF", "Mutual Fund"
    isActive: bool

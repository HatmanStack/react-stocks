# Understanding Sentiment Analysis

This app uses advanced AI to analyze financial news and help you make better investment decisions. Here's what you need to know.

## Three-Signal Sentiment System

We analyze news using three independent AI systems that work together:

### 1. Event Type Classification 📊

**What it does:** Automatically categorizes news by type

**Event Types:**
- **Earnings** 💰 - Quarterly results, revenue, profit reports
- **M&A** 🤝 - Mergers, acquisitions, partnerships
- **Guidance** 🎯 - Future outlook, forecasts, projections
- **Analyst Rating** ⭐ - Upgrades, downgrades, price targets
- **Product Launch** 🚀 - New products, services, innovations
- **General** 📰 - Other financial news

**Why it matters:** Different event types have different impacts on stock prices. Earnings reports typically move markets more than general news.

### 2. Aspect-Based Sentiment 📈

**What it does:** Analyzes specific financial metrics mentioned in news

**Analyzed Aspects:**
- **Revenue** - Sales performance and growth
- **Earnings** - Profitability and margins
- **Guidance** - Forward-looking statements
- **Margins** - Profit margins and efficiency
- **Growth** - Expansion and market share
- **Debt** - Financial health and leverage

**Score Range:** -1.0 (very negative) to +1.0 (very positive)

**Example:**
> "Apple reports record revenue of $100B (+15% YoY) but margins declined 2%"
>
> - Revenue: +0.8 (strong positive)
> - Margins: -0.3 (negative)
> - Overall Aspect Score: +0.45 (mixed positive)

**Why it matters:** News can be mixed - a company might have great revenue but poor margins. Aspect scores help you see the full picture.

### 3. DistilFinBERT Sentiment 🤖

**What it does:** Advanced AI trained on millions of financial texts to understand context and nuance

**When it's used:** Only for material events (Earnings, M&A, Guidance, Analyst Ratings) that significantly impact stock prices

**Score Range:** -1.0 (very negative) to +1.0 (very positive)

**Sentiment Labels:**
- **Strong Positive** (+0.6 to +1.0) - Very bullish news
- **Positive** (+0.2 to +0.6) - Moderately bullish
- **Neutral** (-0.2 to +0.2) - Mixed or neutral
- **Negative** (-0.6 to -0.2) - Moderately bearish
- **Strong Negative** (-1.0 to -0.6) - Very bearish

**Why it matters:** This is the most accurate sentiment signal, understanding complex language and financial context that simple word counting misses.

## Reading the Sentiment Display

### Daily Aggregate View

Each day shows:

```
Jan 15, 2025

Events:
[Earnings: 2] [M&A: 1] [General: 5]

Aspect Score: +0.45 (Mixed Positive)
  ↳ Revenue: +0.8  |  Earnings: +0.3  |  Guidance: +0.6

DistilFinBERT: +0.72 (Strong Positive)

Overall Sentiment: Positive
```

**How to interpret:**
1. **Event Distribution** - See what types of news occurred
2. **Aspect Score** - Detailed breakdown of financial metrics
3. **DistilFinBERT** - Most reliable signal for material events
4. **Overall Sentiment** - Legacy score (less accurate, kept for reference)

### Multi-Signal Chart

The sentiment chart shows three trend lines:

- **Blue Line** - Legacy sentiment (word counting)
- **Green Line** - Aspect score trend
- **Purple Dashed Line** - DistilFinBERT score (only on days with material events)

**Tip:** The DistilFinBERT line (purple) is the most reliable. Look for patterns where it aligns with price movements.

## Using Event Filters

At the top of the sentiment screen, you can filter by event type:

**Filter Chips:**
- Tap **All** to see everything
- Tap specific event types to focus on what matters to you
- Multiple selections allowed
- Numbers show total events per type

**Use Cases:**
- **Focus on earnings** - Only show quarterly report days
- **Track M&A activity** - See acquisition news
- **Ignore general news** - Filter out less impactful stories

**Tip:** Your filter selection is saved automatically.

## Understanding Mixed Signals

Sometimes the three signals disagree. Here's how to interpret:

### Scenario 1: Strong DistilFinBERT, Weak Aspect
```
Aspect Score: +0.1 (Neutral)
DistilFinBERT: +0.8 (Strong Positive)
```
**Interpretation:** The overall tone is very positive even though specific metrics are mixed. The AI detected optimistic language about future prospects.

### Scenario 2: Strong Aspect, No DistilFinBERT
```
Aspect Score: +0.7 (Positive)
DistilFinBERT: N/A
Event Type: General
```
**Interpretation:** Good financial metrics mentioned, but it's general news (not a material event), so DistilFinBERT didn't analyze it.

### Scenario 3: All Negative
```
Aspect Score: -0.6 (Negative)
DistilFinBERT: -0.7 (Strong Negative)
Event Type: Earnings
```
**Interpretation:** Consistently bearish signals across all metrics. High confidence this is negative news.

## Stock Predictions

Predictions use all three sentiment signals plus price/volume data:

**Model Features (13 total):**
- Price ratios (1-day, 5-day, 10-day)
- Volume trends
- Event type (one-hot encoded, 6 features)
- Aspect score
- DistilFinBERT score
- Volatility

**Prediction Timeframes:**
- **Next Day** - 1-day ahead probability (0-1)
- **2 Weeks** - 2-week ahead probability
- **1 Month** - 1-month ahead probability

**How to read:**
- **> 0.6** - Strong probability price goes up
- **0.4 - 0.6** - Uncertain, could go either way
- **< 0.4** - Strong probability price goes down

**Tip:** Predictions are more accurate when combined with price trends. A high prediction + upward price momentum is a stronger signal.

## Best Practices

### For Day Traders
- Focus on **DistilFinBERT scores** for material events
- Use **event filters** to show only Earnings and Analyst Ratings
- Watch for strong sentiment (+0.6 or higher) on high-volume days

### For Long-Term Investors
- Look at **30-day aspect score trends** for fundamental changes
- Filter for **Earnings + Guidance** events
- Compare sentiment to actual price movement over weeks

### For Risk Management
- Strong negative sentiment (-0.6 or lower) on earnings day = potential sell signal
- Consistently negative aspect scores across multiple quarters = deteriorating fundamentals
- Mixed signals = higher uncertainty, consider waiting

## Frequently Asked Questions

**Q: Why is DistilFinBERT sometimes missing?**
A: It only runs for material events (Earnings, M&A, Guidance, Analyst Ratings) that significantly impact stocks. General news uses simpler analysis.

**Q: Which signal should I trust most?**
A: DistilFinBERT is the most accurate when available. Aspect scores are helpful for understanding specific metrics. Legacy sentiment is least accurate but shows historical context.

**Q: How often is sentiment updated?**
A: News is fetched daily. Sentiment analysis runs automatically when new articles are detected.

**Q: Can I filter by multiple event types?**
A: Yes! Tap multiple chips to combine filters. For example, show only Earnings + Guidance.

**Q: Why do predictions change?**
A: Predictions are recalculated daily as new sentiment data arrives. They reflect the most recent 30 days of data.

**Q: What if all three signals disagree?**
A: This indicates uncertainty. In these cases, rely more heavily on price action and volume. Mixed signals often precede volatility.

## Need Help?

For technical issues or questions:
- Check the app settings for configuration options
- Review the sentiment tab legend for quick reference
- Sentiment data is cached locally for offline access

**Remember:** Sentiment analysis is a tool to inform decisions, not a guarantee of future performance. Always do your own research and consider multiple factors before investing.

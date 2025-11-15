# DynamoDB Cost Optimization Guide

## Current Configuration

### TTL Settings

The following TTL (Time-To-Live) values are configured for automatic data expiration:

| Table | TTL Duration | Rationale | Repository |
|-------|--------------|-----------|------------|
| StocksCache | 7 days | Historical prices rarely change, re-fetch is cheap | `stocksCache.repository.ts:114` |
| NewsCache | 30 days | News articles don't change, useful for recent context | `newsCache.repository.ts:100` |
| SentimentCache | 90 days | Sentiment is timeless, keep longer for cache hits | `sentimentCache.repository.ts:103` |
| SentimentJobs | 1 day | Jobs only relevant during processing, cleanup quickly | `sentimentJobs.repository.ts:105` |

### Billing Mode

All tables use **PAY_PER_REQUEST** (on-demand billing):
- No upfront capacity planning required
- Automatically scales with demand
- Pay only for actual read/write operations
- See `template.yaml:35` for configuration

## Cost Analysis

### DynamoDB Pricing (US East 1)

- **On-Demand Writes**: $1.25 per million write request units
- **On-Demand Reads**: $0.25 per million read request units
- **Storage**: First 25 GB free, then $0.25 per GB-month
- **TTL Deletion**: Free (automated cleanup)

### Estimated Costs (100 Active Users)

**Assumptions:**
- 10 popular stocks + 90 long-tail stocks
- 80% cache hit rate (warm cache after deployment)
- Average 30-day data range per query

**Daily Operations:**

| Operation | Count | Cost |
|-----------|-------|------|
| Stock Price Reads | ~2,000 (80% cache hit) | $0.0005 |
| Stock Price Writes | ~500 (new data only) | $0.0006 |
| News Reads | ~1,500 (80% cache hit) | $0.0004 |
| News Writes | ~300 (new articles only) | $0.0004 |
| Sentiment Reads | ~1,500 (80% cache hit) | $0.0004 |
| Sentiment Writes | ~300 (new sentiment) | $0.0004 |
| Job Tracking | ~200 (job status polls) | $0.0003 |
| **Daily Total** | | **~$0.30/day** |
| **Monthly Total** | | **~$9/month** |

## Cost Target

Target: <$20/month ✅

**Storage Costs:**
- StocksCache: ~10 MB (minimal historical data)
- NewsCache: ~50 MB (article metadata only)
- SentimentCache: ~20 MB (word counts)
- Total: ~80 MB (**Well under 25 GB free tier**)

**Projected Monthly Cost: $9-12/month for 100 users**

Target: <$20/month ✅

## Optimization Strategies

### 1. Monitor Cache Hit Rate

Use CloudWatch dashboard to track cache hit rate:

```bash
npm run create-dashboard
```

Target: >70% cache hit rate

If cache hit rate drops below 70%:
- Check TTL settings (may need to extend)
- Verify cache warming script is running post-deployment
- Investigate if users are querying unusual date ranges

### 2. Batch Operations

**Already Optimized:** All repositories use `batchWriteItem` and `batchGetItem`:

```typescript
// stocksCache.repository.ts:180
export async function batchPutStocks(stocks: StocksCacheItem[]): Promise<void> {
  await batchPutItems(STOCKS_CACHE_TABLE, stocks, 'StocksCache');
}
```

Batch size: 25 items (DynamoDB limit)

### 3. TTL Tuning

Current TTL values are optimized for cache hit rate vs storage cost balance.

**If storage costs increase** (unlikely given small data size):
- Reduce StocksCache TTL from 7 to 5 days
- Reduce NewsCache TTL from 30 to 21 days
- Keep SentimentCache at 90 days (highest cache hit value)

**To adjust TTL**, modify repository files:
```typescript
// src/repositories/stocksCache.repository.ts
ttl: calculateTTL(5), // Reduced from 7 days
```

### 4. Cost Alerts

Create billing alarm in AWS:

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name DynamoDBCostAlert \
  --alarm-description "Alert if DynamoDB costs exceed $25/month" \
  --metric-name EstimatedCharges \
  --namespace AWS/Billing \
  --statistic Maximum \
  --period 86400 \
  --evaluation-periods 1 \
  --threshold 25 \
  --comparison-operator GreaterThanThreshold \
  --dimensions Name=ServiceName,Value=AmazonDynamoDB
```

## Monitoring Commands

### View Current DynamoDB Costs

```bash
# View last 30 days of DynamoDB costs
aws ce get-cost-and-usage \
  --time-period Start=2025-01-01,End=2025-02-01 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --filter file://dynamodb-filter.json

# dynamodb-filter.json:
# {
#   "Dimensions": {
#     "Key": "SERVICE",
#     "Values": ["Amazon DynamoDB"]
#   }
# }
```

### View Read/Write Metrics

```bash
# View consumed read capacity for last 7 days
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=react-stocks-StocksCache \
  --start-time 2025-01-08T00:00:00Z \
  --end-time 2025-01-15T00:00:00Z \
  --period 86400 \
  --statistics Sum
```

## Cost Reduction Checklist

- [x] PAY_PER_REQUEST billing mode enabled
- [x] TTL enabled on all tables
- [x] Batch operations used throughout
- [x] Cache warming reduces redundant API calls
- [x] 80%+ cache hit rate target
- [ ] Billing alerts configured (run command above)
- [ ] Monthly cost review scheduled

## Scaling Estimates

| Users | Estimated Monthly Cost |
|-------|------------------------|
| 10 | $2-3 |
| 100 | $9-12 |
| 500 | $40-50 |
| 1000 | $80-100 |

**Note:** Costs scale sub-linearly due to cache sharing. 10x users ≠ 10x cost.

## Troubleshooting High Costs

### If costs exceed $20/month for 100 users:

1. **Check cache hit rate**:
   - Open CloudWatch Dashboard
   - Verify CacheHitRate metric >70%
   - If low, run `npm run warm-cache`

2. **Check for excessive writes**:
   - Review ConsumedWriteCapacityUnits metric
   - Look for duplicate writes (should use deduplication)
   - Verify TTL is working (old data being deleted)

3. **Check for hot partitions**:
   - Review DynamoDB hot key metrics
   - Ensure ticker symbols well-distributed
   - Consider adding partition key randomization if needed

4. **Review table sizes**:
   ```bash
   aws dynamodb describe-table --table-name react-stocks-StocksCache \
     | jq '.Table.TableSizeBytes'
   ```

## References

- [DynamoDB Pricing](https://aws.amazon.com/dynamodb/pricing/)
- [DynamoDB On-Demand Capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteCapacityMode.html#HowItWorks.OnDemand)
- [DynamoDB TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
- [AWS Cost Explorer](https://console.aws.amazon.com/cost-management/home#/cost-explorer)

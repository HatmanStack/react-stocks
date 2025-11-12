# Incident Response Runbook

This runbook provides step-by-step procedures for responding to common incidents in the React Stocks production system.

## Table of Contents

1. [General Incident Response](#general-incident-response)
2. [High Error Rate](#high-error-rate)
3. [High Latency / Slow Performance](#high-latency--slow-performance)
4. [Lambda Timeouts](#lambda-timeouts)
5. [Lambda Throttling](#lambda-throttling)
6. [API Gateway 5xx Errors](#api-gateway-5xx-errors)
7. [External API Failures](#external-api-failures)
8. [Invalid API Keys](#invalid-api-keys)
9. [High Costs / Unexpected Billing](#high-costs--unexpected-billing)
10. [Complete Outage](#complete-outage)
11. [Rollback Procedure](#rollback-procedure)
12. [Escalation](#escalation)

---

## General Incident Response

### Incident Response Process

1. **Acknowledge** (30 seconds)
   - Acknowledge the alert (PagerDuty, email, Slack)
   - Note the time incident began

2. **Assess** (2 minutes)
   - Open CloudWatch Dashboard
   - Check current status and scope
   - Determine severity (P1-Critical, P2-High, P3-Medium, P4-Low)

3. **Communicate** (1 minute)
   - Notify team in Slack (#react-stocks-incidents)
   - For P1/P2: Page additional team members if needed

4. **Investigate** (5-15 minutes)
   - Follow specific runbook procedure
   - Check CloudWatch Logs for errors
   - Review recent changes (deployments, config)

5. **Mitigate** (Variable)
   - Apply fix or workaround
   - Verify resolution in CloudWatch
   - Monitor for 10-15 minutes

6. **Document** (5 minutes)
   - Record timeline, root cause, resolution
   - Update runbook if needed
   - Create postmortem for P1/P2 incidents

### Severity Levels

| Severity | Description | Response Time | Examples |
|----------|-------------|---------------|----------|
| **P1 - Critical** | Complete outage, all users affected | Immediate | Lambda not responding, API Gateway down |
| **P2 - High** | Major degradation, many users affected | <15 minutes | High error rate (>5%), severe latency |
| **P3 - Medium** | Partial degradation, some users affected | <1 hour | Moderate errors, occasional timeouts |
| **P4 - Low** | Minor issues, few users affected | <4 hours | Rare errors, slight performance degradation |

---

## High Error Rate

### Alarm
**Lambda Error Rate High** or **API Gateway 5xx Rate High**

### Symptoms
- CloudWatch Dashboard shows error spike
- Users reporting failures
- Lambda Errors metric >5%

### Investigation Steps

1. **Check CloudWatch Logs** (2 minutes)
   ```
   Query: Recent Errors (last 15 minutes)
   fields @timestamp, @message, @requestId
   | filter @message like /ERROR/
   | sort @timestamp desc
   | limit 50
   ```

2. **Identify Error Pattern** (2 minutes)
   - All requests failing? → Complete outage
   - Specific endpoint failing? → Targeted issue
   - Intermittent errors? → External dependency

3. **Check External APIs** (1 minute)
   - Tiingo status: https://api.tiingo.com/status
   - Polygon status: https://status.polygon.io/
   - Look for service degradation

4. **Review Recent Changes** (1 minute)
   - Any recent deployments? Check git log
   - Any config changes? Check parameter store

### Resolution

#### If External API is Down
```
Action: Wait for recovery, monitor
Timeline: Depends on external service
Communication: Post status update in Slack
```

#### If Lambda Code Issue
```
Action: Rollback to previous version
Steps:
1. cd backend
2. git log --oneline -5  # Find previous working commit
3. git checkout <COMMIT_HASH>
4. sam build && sam deploy --config-env production
5. Verify: curl https://API_URL/stocks?ticker=AAPL&startDate=2024-01-01
```

#### If API Key Issue
```
Action: Rotate API keys
Steps:
1. Login to Tiingo/Polygon dashboard
2. Generate new API key
3. Deploy with new key:
   sam deploy --config-env production \
     --parameter-overrides TiingoApiKey=NEW_KEY PolygonApiKey=NEW_KEY2
4. Monitor: CloudWatch Dashboard
```

### Prevention
- Monitor external API status pages
- Implement retry logic with exponential backoff
- Set up synthetic monitoring (ping endpoints regularly)

---

## High Latency / Slow Performance

### Alarm
**Lambda Duration P95 High** or **API Gateway Latency P95 High**

### Symptoms
- Slow response times (>1-2 seconds)
- Users complaining of sluggishness
- CloudWatch shows elevated duration

### Investigation Steps

1. **Check Percentiles** (1 minute)
   - CloudWatch Dashboard → Lambda Duration widget
   - Note p50, p95, p99 values

2. **Identify Slow Requests** (2 minutes)
   ```
   Query: Slow Requests
   fields @timestamp, @duration, @message
   | filter @type = "REPORT"
   | filter @duration > 1000
   | sort @duration desc
   | limit 20
   ```

3. **Check External API Latency** (1 minute)
   - Test Tiingo: `time curl "https://api.tiingo.com/tiingo/daily/aapl/prices?token=YOUR_KEY"`
   - Test Polygon: `time curl "https://api.polygon.io/v2/reference/news?ticker=AAPL&apiKey=YOUR_KEY"`

4. **Check Lambda Cold Starts** (1 minute)
   ```
   Query: Cold Starts
   fields @timestamp, @initDuration
   | filter @type = "REPORT" and ispresent(@initDuration)
   | stats count(), avg(@initDuration), max(@initDuration)
   ```

### Resolution

#### If External API is Slow
```
Action: Monitor and wait (if temporary) or implement caching
Immediate: No action needed, external issue
Long-term: Add API Gateway caching or Lambda-level caching
```

#### If Cold Starts are Issue
```
Action: Increase traffic or enable provisioned concurrency
Steps (Provisioned Concurrency):
1. Update template.yaml:
   ProvisionedConcurrentExecutions: 2
2. sam deploy --config-env production
3. Monitor: Cold starts should decrease
Note: Increases costs (~$12/month per instance)
```

#### If Lambda is Under-Resourced
```
Action: Increase memory (also increases CPU)
Steps:
1. Update template.yaml:
   MemorySize: 1024  # Increase from 512
2. sam deploy --config-env production
3. Monitor: Duration should decrease
4. Fine-tune: Adjust memory based on results
```

### Prevention
- Regular load testing
- Performance monitoring trends
- Cache frequently accessed data

---

## Lambda Timeouts

### Alarm
**Lambda Timeout Rate High**

### Symptoms
- Lambda Duration approaching/exceeding 30s
- Task timed out errors in logs
- API Gateway 504 errors

### Investigation Steps

1. **Check Timeout Occurrences** (1 minute)
   ```
   Query: Timeouts
   fields @timestamp, @message
   | filter @message like /Task timed out/
   | sort @timestamp desc
   ```

2. **Identify Slow Operations** (2 minutes)
   - Which endpoint is timing out?
   - Is it consistent or intermittent?
   - Check external API response times

### Resolution

#### Immediate Fix: Increase Timeout
```
Steps:
1. Update template.yaml:
   Timeout: 60  # Increase from 30
2. sam deploy --config-env production
3. Monitor: Timeouts should decrease
```

#### Long-term Fix: Optimize Code
```
Investigation:
- Profile slow operations
- Optimize database queries
- Parallelize external API calls
- Reduce payload sizes
```

### Prevention
- Set realistic timeouts based on p99 duration
- Implement timeouts for external API calls
- Monitor duration trends

---

## Lambda Throttling

### Alarm
**Lambda Throttles Detected**

### Symptoms
- Lambda Throttles metric >0
- API Gateway 429 errors
- Some requests failing randomly

### Investigation Steps

1. **Check Concurrent Executions** (1 minute)
   - CloudWatch Dashboard → Lambda Concurrent Executions
   - Note current and peak values

2. **Check Account Limits** (1 minute)
   ```bash
   aws lambda get-account-settings
   ```
   Look for `ConcurrentExecutionsLimit`

3. **Identify Traffic Pattern** (2 minutes)
   - Sudden spike in traffic?
   - DDoS attack?
   - Legitimate traffic increase?

### Resolution

#### Immediate: Increase Reserved Concurrency
```
Steps:
1. aws lambda put-function-concurrency \
     --function-name react-stocks-backend-prod-ReactStocksFunction \
     --reserved-concurrent-executions 200
2. Monitor throttles (should stop)
```

#### Long-term: Request Limit Increase
```
Steps:
1. AWS Console → Support → Create Case
2. Service: Lambda
3. Category: Concurrency limit increase
4. Requested limit: 2000 (or as needed)
5. Justification: Production workload
Timeline: 24-48 hours for approval
```

### Prevention
- Monitor concurrent execution trends
- Plan for traffic spikes (events, launches)
- Implement API Gateway throttling to protect backend

---

## API Gateway 5xx Errors

### Alarm
**API Gateway 5xx Rate High**

### Symptoms
- 5xx errors in API Gateway metrics
- Backend health issues
- Users seeing 500/502/503/504 errors

### Investigation Steps

1. **Identify Error Type** (1 minute)
   - 500 Internal Server Error → Backend issue
   - 502 Bad Gateway → Lambda error or timeout
   - 503 Service Unavailable → Throttling or Lambda failure
   - 504 Gateway Timeout → Lambda timeout (>29s)

2. **Check Lambda Health** (1 minute)
   - CloudWatch Dashboard → Lambda metrics
   - Any errors, timeouts, or throttles?

3. **Check Backend Logs** (2 minutes)
   ```
   Query: Recent Backend Errors
   fields @timestamp, @message
   | filter @message like /ERROR/ or @message like /Exception/
   | sort @timestamp desc
   ```

### Resolution

#### If 502 (Bad Gateway)
- Usually Lambda returning invalid response or crashing
- Check Lambda logs for exceptions
- Rollback if recent deployment

#### If 503 (Service Unavailable)
- Check for throttling
- Increase concurrency limits
- Check Lambda health

#### If 504 (Gateway Timeout)
- Lambda exceeding 29s (API Gateway limit)
- Increase Lambda timeout (Step 1)
- Optimize slow operations (Step 2)

### Prevention
- Comprehensive error handling in Lambda
- Input validation to prevent crashes
- Load testing before deployments

---

## External API Failures

### Symptoms
- Errors calling Tiingo or Polygon APIs
- "API key invalid" or "Rate limit exceeded" messages
- 429 or 503 from external APIs

### Investigation Steps

1. **Check External API Status**
   - Tiingo: https://api.tiingo.com/
   - Polygon: https://status.polygon.io/

2. **Test API Keys** (2 minutes)
   ```bash
   # Test Tiingo
   curl "https://api.tiingo.com/tiingo/daily/aapl/prices?token=YOUR_KEY"

   # Test Polygon
   curl "https://api.polygon.io/v2/reference/news?ticker=AAPL&apiKey=YOUR_KEY"
   ```

3. **Check Rate Limits**
   - Tiingo: Check response headers for rate limit info
   - Polygon: Check account usage dashboard

### Resolution

#### If External API is Down
```
Action: Wait for recovery
Communication:
- Post status in Slack
- Update users if prolonged outage
Timeline: Depends on external service
```

#### If Rate Limit Exceeded
```
Immediate Action:
- Reduce request frequency
- Implement request caching
- Batch requests if possible

Long-term Action:
- Upgrade API plan (if needed)
- Implement more aggressive caching
- Use multiple API keys (if allowed)
```

#### If API Key Invalid
```
Action: Rotate keys
Steps: See "Invalid API Keys" section below
```

### Prevention
- Monitor external API status pages
- Implement caching to reduce API calls
- Set up alerts for rate limit warnings
- Have backup API keys ready

---

## Invalid API Keys

### Symptoms
- "Invalid API key" or "Unauthorized" errors
- 401/403 responses from external APIs
- All API calls failing

### Investigation Steps

1. **Test API Keys** (2 minutes)
   ```bash
   # Get current keys from Lambda environment
   aws lambda get-function-configuration \
     --function-name react-stocks-backend-prod-ReactStocksFunction \
     | grep -E "TIINGO_API_KEY|POLYGON_API_KEY"

   # Test keys
   curl "https://api.tiingo.com/tiingo/daily/aapl/prices?token=KEY_HERE"
   ```

2. **Check Key Expiration**
   - Login to Tiingo/Polygon dashboard
   - Verify keys are active and not expired

3. **Check Key Rotation History**
   - Were keys recently rotated?
   - Was deployment successful?

### Resolution

#### Rotate API Keys
```
Steps:
1. Generate new keys:
   - Tiingo: https://www.tiingo.com/account/api
   - Polygon: https://polygon.io/dashboard/api-keys

2. Update Lambda:
   cd backend
   sam deploy --config-env production \
     --parameter-overrides \
       TiingoApiKey=NEW_TIINGO_KEY \
       PolygonApiKey=NEW_POLYGON_KEY

3. Verify deployment:
   aws lambda get-function-configuration \
     --function-name react-stocks-backend-prod-ReactStocksFunction

4. Test:
   curl "https://YOUR_API_URL/stocks?ticker=AAPL&startDate=2024-01-01"

5. Monitor:
   Watch CloudWatch for successful requests
```

### Prevention
- Set calendar reminders for key rotation (every 90 days)
- Keep backup keys available
- Document key rotation procedure
- Test keys in staging before production

---

## High Costs / Unexpected Billing

### Symptoms
- AWS bill higher than expected
- Cost anomaly detection alert
- Unusual Lambda invocation count

### Investigation Steps

1. **Check Cost Explorer** (2 minutes)
   - AWS Console → Cost Explorer
   - Daily costs for last week
   - Group by service

2. **Identify High-Cost Service** (2 minutes)
   - Lambda invocations unusually high?
   - Data transfer costs?
   - CloudWatch Logs growing?

3. **Check for Abuse** (3 minutes)
   - API Gateway access logs
   - Unusual traffic patterns?
   - DDoS attack?

### Resolution

#### If Legitimate Traffic Spike
```
Action: Monitor and optimize
Steps:
- Review if spike is expected
- Optimize Lambda memory/duration to reduce costs
- Implement caching to reduce invocations
```

#### If Abuse/DDoS Detected
```
Immediate Action:
1. Enable API Gateway throttling:
   BurstLimit: 100
   RateLimit: 50 requests/second

2. Monitor traffic:
   Review API Gateway access logs for suspicious IPs

3. Consider WAF:
   Add AWS WAF rules to block malicious traffic

Timeline: Immediate implementation possible
```

#### If CloudWatch Logs Growing
```
Action: Set retention policy
Steps:
aws logs put-retention-policy \
  --log-group-name /aws/lambda/react-stocks-backend-prod-ReactStocksFunction \
  --retention-in-days 30
```

### Prevention
- Set up AWS Budgets with alerts
- Regular cost reviews (weekly)
- Implement API Gateway throttling
- Monitor for unusual patterns

---

## Complete Outage

### Symptoms
- All API requests failing
- Lambda not responding
- API Gateway returning 503/504

### Investigation Steps

1. **Verify Outage** (1 minute)
   ```bash
   # Test API directly
   curl https://YOUR_API_URL/stocks?ticker=AAPL&startDate=2024-01-01
   ```

2. **Check AWS Health Dashboard** (30 seconds)
   - AWS Console → Personal Health Dashboard
   - Any AWS service issues in your region?

3. **Check CloudFormation Stack** (1 minute)
   ```bash
   aws cloudformation describe-stacks \
     --stack-name react-stocks-backend-prod
   ```
   Status should be `CREATE_COMPLETE` or `UPDATE_COMPLETE`

4. **Check Lambda Function** (1 minute)
   ```bash
   aws lambda get-function \
     --function-name react-stocks-backend-prod-ReactStocksFunction
   ```

### Resolution

#### If AWS Regional Outage
```
Action: Wait for AWS recovery
Communication:
- Post status to users
- Monitor AWS status page
Timeline: Varies (AWS responsibility)
```

#### If Lambda Function Missing/Broken
```
Action: Redeploy infrastructure
Steps:
1. cd backend
2. sam build
3. sam deploy --config-env production
4. Verify: Test API endpoint
```

#### If CloudFormation Stack Failed
```
Action: Review stack events, rollback if needed
Steps:
1. aws cloudformation describe-stack-events \
     --stack-name react-stocks-backend-prod
2. Identify failure reason
3. Fix issue and redeploy OR
4. Rollback: aws cloudformation rollback-stack \
     --stack-name react-stocks-backend-prod
```

### Prevention
- Multi-region deployment (advanced, cost consideration)
- Regular disaster recovery drills
- Maintain infrastructure-as-code in git
- Automated backups and deployment scripts

---

## Rollback Procedure

### When to Rollback

Rollback when:
- New deployment causing errors
- Performance significantly degraded
- Critical bugs in production
- Incident severity P1 or P2 lasting >15 minutes

### Backend Rollback

#### Option 1: CloudFormation Rollback
```bash
# Automatic rollback (if deployment failed)
# CloudFormation will automatically rollback on failure

# Manual rollback to previous stack
aws cloudformation rollback-stack \
  --stack-name react-stocks-backend-prod
```

#### Option 2: Git-based Rollback
```bash
# Find working commit
cd backend
git log --oneline -10

# Checkout previous commit
git checkout <PREVIOUS_COMMIT_HASH>

# Redeploy
sam build
sam deploy --config-env production \
  --parameter-overrides TiingoApiKey=KEY1 PolygonApiKey=KEY2

# Verify
curl https://API_URL/stocks?ticker=AAPL&startDate=2024-01-01
```

### Frontend Rollback

Depends on hosting platform:

**Vercel**:
```bash
vercel rollback
```

**Netlify**:
```bash
netlify rollback
```

**S3/CloudFront**:
```bash
# Restore from backup
aws s3 sync s3://backup-bucket/ s3://live-bucket/ --delete
aws cloudfront create-invalidation --distribution-id ID --paths "/*"
```

### Verification After Rollback

1. Test API endpoints manually
2. Check CloudWatch metrics (errors should stop)
3. Monitor for 15 minutes
4. Verify user reports (issues resolved?)

### Post-Rollback

1. Document why rollback was needed
2. Fix issue in non-production environment
3. Test thoroughly
4. Redeploy when ready
5. Update runbook with learnings

---

## Escalation

### Escalation Path

**Level 1**: On-call engineer (you)
- Handle P3/P4 incidents
- Initial response to P1/P2

**Level 2**: Senior engineer / Team lead
- Complex P2 incidents
- P1 incidents not resolved in 30 minutes

**Level 3**: Engineering manager + AWS Support
- P1 incidents not resolved in 1 hour
- AWS infrastructure issues
- Need for emergency resource increases

### When to Escalate

**Escalate Immediately for**:
- P1 complete outage lasting >30 minutes
- AWS regional outage affecting service
- Security incident (data breach, DDoS)
- Unable to diagnose root cause within 30 minutes

**Escalate Within 1 Hour for**:
- P2 incidents with no clear resolution path
- Need for AWS account changes (limits, etc.)
- Multiple simultaneous incidents

### Contact Information

| Role | Contact | Availability |
|------|---------|--------------|
| On-Call Engineer | [PagerDuty / Phone] | 24/7 |
| Engineering Lead | [Email / Slack / Phone] | Business hours + escalations |
| AWS Support | [Support Portal] | Based on support plan |
| Security Team | [Security Email] | Security incidents only |

### External Contacts

| Service | Status Page | Support |
|---------|-------------|---------|
| AWS | https://health.aws.amazon.com/health/status | Support Portal |
| Tiingo | https://www.tiingo.com/ | support@tiingo.com |
| Polygon | https://status.polygon.io/ | support@polygon.io |

---

## Postmortem Process

### Required for P1/P2 Incidents

**Timeline**: Within 48 hours of incident resolution

**Template**:
```markdown
# Postmortem: [Incident Title]

## Summary
- **Date**: YYYY-MM-DD
- **Duration**: X hours Y minutes
- **Severity**: P1/P2
- **Impact**: [User impact description]

## Timeline
- HH:MM - Incident began
- HH:MM - Alert fired
- HH:MM - Investigation started
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Incident resolved

## Root Cause
[Detailed technical explanation]

## Resolution
[What was done to fix it]

## Prevention
[Action items to prevent recurrence]
- [ ] Action item 1
- [ ] Action item 2

## Lessons Learned
[What we learned, what we'll do better]
```

### Postmortem Review

- Share with team (Slack, email)
- Discuss in team meeting
- Update runbook with new procedures
- Track action items to completion

---

**Document Version**: 1.0
**Last Updated**: 2025-11-12
**Next Review**: After first major incident or monthly

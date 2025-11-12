# Monitoring Guide

This guide explains how to monitor the React Stocks production system using AWS CloudWatch.

## Table of Contents

1. [Overview](#overview)
2. [CloudWatch Dashboard](#cloudwatch-dashboard)
3. [Key Metrics](#key-metrics)
4. [CloudWatch Alarms](#cloudwatch-alarms)
5. [Log Analysis](#log-analysis)
6. [Daily Monitoring Routine](#daily-monitoring-routine)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The React Stocks backend runs on AWS Lambda with API Gateway. Monitoring is essential to:
- Detect issues before users are impacted
- Identify performance degradation
- Optimize costs
- Plan capacity

**Monitoring Stack**:
- **CloudWatch Metrics**: Lambda and API Gateway metrics
- **CloudWatch Logs**: Application logs and errors
- **CloudWatch Alarms**: Automated alerting
- **CloudWatch Dashboards**: Visual monitoring

---

## CloudWatch Dashboard

### Accessing the Dashboard

1. **AWS Console**: Navigate to CloudWatch → Dashboards
2. **Dashboard Name**: `ReactStocksBackend` (or as configured)
3. **Location**: `backend/monitoring/dashboard.json`

### Dashboard Setup

**Option 1: Import via Console**
1. Open CloudWatch Console
2. Dashboards → Create dashboard
3. Actions → View/edit source
4. Paste contents of `backend/monitoring/dashboard.json`
5. Save dashboard

**Option 2: Deploy via CLI**
```bash
aws cloudwatch put-dashboard \
  --dashboard-name ReactStocksBackend \
  --dashboard-body file://backend/monitoring/dashboard.json
```

### Dashboard Widgets

The dashboard includes:

1. **Lambda Invocations**: Total Lambda function calls
2. **Lambda Duration**: p50, p95, p99 response times
3. **Lambda Errors**: Error and throttle counts
4. **Lambda Concurrent Executions**: Concurrent function executions
5. **API Gateway Requests**: Total API requests
6. **API Gateway Latency**: p50, p95, p99 latency
7. **API Gateway 4xx Errors**: Client errors
8. **API Gateway 5xx Errors**: Server errors
9. **Recent Lambda Errors**: Log stream of recent errors

---

## Key Metrics

### Lambda Metrics

#### Invocations
- **What**: Number of times Lambda function is invoked
- **Normal**: Varies by traffic, typically steady
- **Alert**: Sudden spike or drop may indicate issues
- **Action**: Investigate if unexpected changes occur

#### Duration
- **What**: Time Lambda takes to execute (in milliseconds)
- **Normal**:
  - p50: <300ms
  - p95: <500ms
  - p99: <1000ms
- **Alert**: Sustained increase in duration
- **Action**: Check external API response times, optimize code

#### Errors
- **What**: Number of invocations that resulted in errors
- **Normal**: 0 or very low (<0.1%)
- **Alert**: Any sustained error rate >1%
- **Action**: Check CloudWatch Logs for error details

#### Throttles
- **What**: Invocations rejected due to concurrency limits
- **Normal**: 0
- **Alert**: Any throttles
- **Action**: Increase reserved concurrency or account limits

#### Concurrent Executions
- **What**: Number of Lambda instances running simultaneously
- **Normal**: <100 for typical traffic
- **Alert**: Approaching account limit (default 1000)
- **Action**: Request limit increase or optimize performance

### API Gateway Metrics

#### Count
- **What**: Total number of API requests
- **Normal**: Matches expected traffic patterns
- **Alert**: Unusual spikes (possible abuse)
- **Action**: Review API Gateway access logs

#### Latency
- **What**: Time from API Gateway receiving request to returning response
- **Normal**:
  - p50: <400ms
  - p95: <600ms
  - p99: <1200ms
- **Alert**: Sustained high latency
- **Action**: Check Lambda duration, external API performance

#### 4XXError
- **What**: Client errors (bad requests)
- **Normal**: Low (<5% of requests)
- **Alert**: Sudden spike
- **Action**: Check for client bugs, invalid inputs

#### 5XXError
- **What**: Server errors (backend failures)
- **Normal**: 0 or very low (<0.1%)
- **Alert**: Any sustained 5xx error rate >0.5%
- **Action**: CRITICAL - check CloudWatch Logs immediately

---

## CloudWatch Alarms

### Alarm Setup

**Location**: `backend/monitoring/alarms.yaml`

**Deployment**:
```bash
# Create SNS topics for notifications
aws sns create-topic --name react-stocks-critical-alarms
aws sns create-topic --name react-stocks-warning-alarms
aws sns create-topic --name react-stocks-informational-alarms

# Subscribe to topics
aws sns subscribe \
  --topic-arn arn:aws:sns:REGION:ACCOUNT_ID:react-stocks-critical-alarms \
  --protocol email \
  --notification-endpoint your-email@example.com

# Deploy alarms (manually or via CloudFormation)
```

### Alarm Categories

#### Critical Alarms (Page On-Call)

| Alarm | Condition | Action |
|-------|-----------|--------|
| **Lambda Error Rate High** | Error rate >5% for 5 minutes | Check logs, investigate root cause immediately |
| **API Gateway 5xx Rate High** | 5xx rate >1% for 5 minutes | Check Lambda errors, external API status |
| **Lambda Timeout Rate High** | Timeouts >10% for 10 minutes | Increase timeout, optimize slow operations |

#### Warning Alarms (Email)

| Alarm | Condition | Action |
|-------|-----------|--------|
| **Lambda Duration P95 High** | p95 >1s for 15 minutes | Optimize performance, check external APIs |
| **Lambda Throttles Detected** | Any throttles | Increase concurrency limits |
| **API Gateway 4xx Rate High** | 4xx >10% for 15 minutes | Check frontend for bugs, validate inputs |
| **API Gateway Latency P95 High** | p95 >2s for 15 minutes | Optimize Lambda, check external APIs |

#### Informational Alarms

| Alarm | Condition | Action |
|-------|-----------|--------|
| **Lambda Concurrent High** | Concurrent >800 | Plan for scaling, monitor trends |

### Alarm Response

**When an alarm fires**:
1. **Acknowledge**: Acknowledge receipt (PagerDuty, etc.)
2. **Assess**: Check CloudWatch Dashboard for context
3. **Investigate**: Follow runbook for specific alarm
4. **Resolve**: Apply fix and verify alarm clears
5. **Document**: Update runbook with learnings

---

## Log Analysis

### Accessing Logs

**CloudWatch Logs**: Console → Logs → Log groups
**Log Group**: `/aws/lambda/react-stocks-backend-prod-ReactStocksFunction`

### Useful Log Queries

#### Recent Errors
```
fields @timestamp, @message
| filter @message like /ERROR/
| sort @timestamp desc
| limit 50
```

#### Slow Requests (>1s)
```
fields @timestamp, @duration, @message
| filter @type = "REPORT"
| filter @duration > 1000
| sort @duration desc
| limit 50
```

#### Errors by Request ID
```
fields @timestamp, @message
| filter @message like /REQUEST_ID_HERE/
| sort @timestamp asc
```

#### Error Rate by Hour
```
fields @timestamp, @message
| filter @message like /ERROR/
| stats count() by bin(5m)
```

#### Top Error Messages
```
fields @message
| filter @message like /ERROR/
| stats count() by @message
| sort count() desc
| limit 10
```

### Log Retention

**Default**: Indefinite (incurs costs)

**Recommended**: 30 days for production

**Configure**:
```bash
aws logs put-retention-policy \
  --log-group-name /aws/lambda/react-stocks-backend-prod-ReactStocksFunction \
  --retention-in-days 30
```

---

## Daily Monitoring Routine

### Morning Check (5 minutes)

1. **Open CloudWatch Dashboard**
   - Check for visual anomalies (spikes, dips)
   - Verify all metrics trending normally

2. **Check Alarms**
   - Any alarms in ALARM state?
   - Review alarm history (last 24 hours)

3. **Quick Log Scan**
   - Run "Recent Errors" query
   - Investigate any unexpected errors

4. **Cost Check** (once per week)
   - AWS Cost Explorer → Daily costs
   - Verify within expected range

### Weekly Review (15 minutes)

1. **Metric Trends**
   - Compare metrics week-over-week
   - Identify any gradual degradation

2. **Error Analysis**
   - Review top error messages
   - Look for patterns or new error types

3. **Performance Review**
   - Check p95/p99 latency trends
   - Identify optimization opportunities

4. **Capacity Planning**
   - Review concurrent execution trends
   - Plan for expected traffic increases

### Monthly Review (30 minutes)

1. **Full Dashboard Review**
   - Month-over-month comparisons
   - Seasonal patterns

2. **Alarm Tuning**
   - False positive rate
   - Adjust thresholds as needed

3. **Cost Optimization**
   - Review AWS costs
   - Identify optimization opportunities

4. **Documentation Update**
   - Update runbook with new issues
   - Refine monitoring guide

---

## Troubleshooting

### High Error Rate

**Symptoms**: Lambda Errors metric spiking, 5xx errors

**Investigation**:
1. Check CloudWatch Logs for error messages
2. Identify error pattern (all requests, specific endpoint, etc.)
3. Check external API status (Tiingo, Polygon)
4. Review recent deployments

**Common Causes**:
- External API down or returning errors
- Invalid API keys (rotated, expired)
- Code bug (recent deployment)
- Resource constraints (timeout, memory)

**Resolution**:
- If external API: Wait for recovery or implement retry logic
- If API keys: Update keys via SAM deployment
- If code bug: Rollback deployment
- If resource: Increase Lambda memory/timeout

### High Latency

**Symptoms**: Lambda Duration or API Gateway Latency increasing

**Investigation**:
1. Check CloudWatch metrics for p95/p99
2. Review CloudWatch Logs for slow requests
3. Check external API response times
4. Review concurrent executions (queuing?)

**Common Causes**:
- External API slowness (Tiingo, Polygon)
- Cold starts (infrequent traffic)
- Inefficient code (large payloads, loops)
- Resource constraints (under-provisioned)

**Resolution**:
- External API: Monitor, contact support
- Cold starts: Consider provisioned concurrency
- Inefficient code: Profile and optimize
- Resources: Increase Lambda memory (also increases CPU)

### Throttling

**Symptoms**: Lambda Throttles metric >0

**Investigation**:
1. Check concurrent executions vs limits
2. Review invocation patterns (sudden spike?)
3. Check for reserved concurrency settings

**Common Causes**:
- Traffic spike exceeding concurrency limits
- Reserved concurrency too low
- Account-level concurrency limit reached

**Resolution**:
- Increase reserved concurrency for function
- Request account limit increase (AWS Support)
- Implement API Gateway throttling (prevent abuse)

### 4xx Errors

**Symptoms**: API Gateway 4XXError metric increasing

**Investigation**:
1. Check access logs for specific 4xx codes
2. Identify endpoints and error types
3. Review frontend code for bugs

**Common Causes**:
- Frontend sending invalid requests
- Missing required parameters
- Invalid ticker symbols
- Malformed dates

**Resolution**:
- Fix frontend validation
- Improve backend error messages
- Add more comprehensive input validation

### No Data / Metrics Missing

**Symptoms**: Dashboard shows no data, alarms INSUFFICIENT_DATA

**Investigation**:
1. Verify Lambda function exists and name matches
2. Check that function has been invoked recently
3. Verify IAM permissions for CloudWatch

**Common Causes**:
- Function not invoked (no traffic)
- Wrong function name in dashboard/alarms
- Metrics delayed (wait 5-10 minutes)

**Resolution**:
- Test function: `aws lambda invoke --function-name XXX`
- Update dashboard with correct function name
- Wait for metric propagation

---

## Cost Monitoring

### Expected Monthly Costs (Typical Traffic)

| Service | Estimated Cost |
|---------|----------------|
| Lambda (1M requests) | $5-10 |
| API Gateway (1M requests) | $3-5 |
| CloudWatch Logs (10GB) | $5 |
| CloudWatch Metrics | $3 |
| **Total** | **~$15-25/month** |

### Cost Optimization

1. **Lambda Memory**: Right-size (don't over-provision)
2. **Log Retention**: Set to 30 days (not indefinite)
3. **Metrics Resolution**: Use 5-minute (not 1-minute) periods
4. **API Gateway Caching**: Enable if appropriate
5. **Reserved Concurrency**: Only if needed (prevent throttling)

### Cost Alerts

Set up AWS Budgets:
```bash
aws budgets create-budget \
  --account-id YOUR_ACCOUNT_ID \
  --budget BudgetName=ReactStocksMonthly \
  --budget-type COST \
  --time-unit MONTHLY \
  --budget-limit Amount=30,Unit=USD \
  --notifications-with-subscribers NotificationType=ACTUAL,ComparisonOperator=GREATER_THAN,Threshold=80
```

---

## Additional Resources

### AWS Documentation
- [CloudWatch User Guide](https://docs.aws.amazon.com/cloudwatch/)
- [Lambda Monitoring](https://docs.aws.amazon.com/lambda/latest/dg/lambda-monitoring.html)
- [API Gateway Monitoring](https://docs.aws.amazon.com/apigateway/latest/developerguide/monitoring-cloudwatch.html)

### Internal Documentation
- [Incident Response Runbook](./runbook.md)
- [Deployment Guide](../deployment/production-deployment.md)
- [Security Checklist](../security/security-checklist.md)

### Contacts
- **On-Call Engineer**: [Contact Info]
- **AWS Support**: [Support Plan Details]
- **Team Slack**: #react-stocks-alerts

---

**Document Version**: 1.0
**Last Updated**: 2025-11-12
**Next Review**: After first month of production

# Security Checklist

This checklist ensures ongoing security for the React Stocks application.

## Pre-Deployment Security Checklist

### Frontend

- [x] **API Keys**: No hardcoded API keys in code
- [x] **Environment Variables**: All secrets in `.env` (not committed to git)
- [x] **Input Validation**: All user inputs validated
- [x] **SQL Injection**: Parameterized queries used
- [x] **XSS Prevention**: No `dangerouslySetInnerHTML` or unescaped HTML
- [x] **Error Handling**: No sensitive data in error messages
- [x] **Dependencies**: `npm audit` clean (0 vulnerabilities)
- [x] **Build**: Production builds minified and optimized

### Backend

- [x] **API Keys**: Stored as encrypted Lambda environment variables
- [x] **CORS**: Configured (⚠️ Update from `*` to specific domains for production)
- [x] **Input Validation**: All Lambda inputs validated
- [x] **Error Responses**: Generic errors, no stack traces exposed
- [x] **IAM Permissions**: Least privilege (CloudWatch Logs only)
- [x] **HTTPS**: Enforced by API Gateway
- [x] **Dependencies**: Backend `npm audit` checked
- [ ] **Rate Limiting**: Configure API Gateway throttling (optional)
- [ ] **Monitoring**: CloudWatch alarms configured

### Infrastructure

- [x] **SAM Template**: No hardcoded secrets
- [x] **NoEcho Parameters**: API keys use `NoEcho: true`
- [x] **Encryption**: Environment variables encrypted at rest
- [x] **Source Maps**: Disabled in production builds
- [ ] **Production Environment**: Deploy with `Environment=production` parameter
- [ ] **CORS Origins**: Update to specific domains for production

## Post-Deployment Security Checklist

### Verification

- [ ] **API Endpoint**: Verify HTTPS URL (starts with `https://`)
- [ ] **CORS**: Test CORS with allowed and disallowed origins
- [ ] **Input Validation**: Test with invalid inputs (SQL injection attempts, XSS)
- [ ] **Error Handling**: Verify errors don't leak sensitive data
- [ ] **Rate Limiting**: Test throttling (if configured)
- [ ] **X-Ray Tracing**: Verify traces appear in AWS X-Ray console
- [ ] **CloudWatch Logs**: Verify logs appear and contain no secrets

### Monitoring

- [ ] **CloudWatch Alarms**: Verify alarms are active
- [ ] **Log Retention**: Set retention period (recommend: 30 days)
- [ ] **Metrics**: Verify Lambda and API Gateway metrics collecting
- [ ] **Anomaly Detection**: Review initial traffic patterns

## Ongoing Security Maintenance

### Monthly Tasks

- [ ] Run `npm audit` on frontend
- [ ] Run `npm audit` on backend
- [ ] Review CloudWatch Logs for anomalies
- [ ] Check CloudWatch Alarms for any triggers
- [ ] Review API Gateway access logs

### Quarterly Tasks

- [ ] Update all dependencies to latest stable versions
- [ ] Review and update IAM permissions
- [ ] Review CORS configuration
- [ ] Test incident response procedures
- [ ] Review rate limiting settings

### Annual Tasks

- [ ] Full security audit (repeat Phase 5 Task 5.2)
- [ ] Rotate API keys (Tiingo, Polygon)
- [ ] Review and update security documentation
- [ ] Penetration testing (if budget allows)
- [ ] Update security training for team

## Incident Response Checklist

### If API Keys Compromised

1. [ ] Immediately revoke compromised keys in provider dashboard
2. [ ] Generate new API keys
3. [ ] Redeploy Lambda with new keys:
   ```bash
   sam deploy --parameter-overrides TiingoApiKey=NEW_KEY PolygonApiKey=NEW_KEY
   ```
4. [ ] Review CloudWatch Logs for unauthorized usage
5. [ ] Document incident and resolution
6. [ ] Update monitoring to detect similar issues

### If Vulnerability Discovered

1. [ ] Assess severity (Critical/High/Medium/Low)
2. [ ] Determine impact and affected components
3. [ ] Apply fix:
   - Dependency: `npm update <package>` or `npm audit fix`
   - Code: Patch and test
4. [ ] Test fix thoroughly
5. [ ] Deploy to staging, verify fix
6. [ ] Deploy to production
7. [ ] Document vulnerability and fix
8. [ ] Update security checklist if needed

### If Unusual Traffic Detected

1. [ ] Review CloudWatch Logs for patterns
2. [ ] Check API Gateway metrics (requests, errors, latency)
3. [ ] Verify requests from legitimate sources
4. [ ] If attack detected:
   - Enable API Gateway rate limiting immediately
   - Consider adding WAF rules
   - Block malicious IPs
5. [ ] Document incident
6. [ ] Update monitoring to detect similar patterns

## Security Contacts

| Role | Responsibility | Contact |
|------|----------------|---------|
| **Security Lead** | Overall security posture | TBD |
| **AWS Admin** | Infrastructure security | TBD |
| **Developer Lead** | Code security, dependencies | TBD |
| **Incident Response** | Security incidents | TBD |

## Security Resources

### Internal Documentation
- `docs/security/security-audit.md` - Latest security audit
- `backend/DEPLOYMENT.md` - Deployment procedures
- `backend/template.yaml` - Infrastructure configuration

### External Resources
- [AWS Lambda Security Best Practices](https://docs.aws.amazon.com/lambda/latest/dg/lambda-security.html)
- [OWASP Top 10](https://owasp.org/Top10/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [React Native Security](https://reactnative.dev/docs/security)

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-11-12 | Initial security checklist (Phase 5) | Automated Setup |

---

**Last Updated**: 2025-11-12
**Next Review**: After production deployment

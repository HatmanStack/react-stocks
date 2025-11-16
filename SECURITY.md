# Security Policy

## Known Security Issues

### d3-color ReDoS Vulnerability (HIGH Severity)

**Status:** ⚠️ ACCEPTED RISK - Monitoring for updates

**CVE:** Not yet assigned
**Severity:** HIGH
**Component:** d3-color <3.1.0
**Vector:** Regular Expression Denial of Service (ReDoS)

#### Affected Dependencies

The vulnerability cascades through our chart visualization stack:
```
d3-color <3.1.0
  └─ d3-interpolate
      └─ d3-interpolate-path
          └─ d3-scale
              └─ react-native-svg-charts@5.4.0
```

#### Impact Assessment

**Risk Level:** LOW in production context

**Reasoning:**
1. **Client-Side Only:** d3-color runs in user's browser/app, not server-side
2. **Limited Attack Surface:** Library only processes color strings from our controlled theme system
3. **No User Input:** Color values are hardcoded in theme or derived from stock prices (numeric)
4. **Sandboxed Execution:** Mobile apps have OS-level isolation
5. **Chart Rendering Context:** Used only for non-critical visualization

**Attack Scenario:**
An attacker would need to inject malicious color strings into the chart rendering pipeline. This is not possible through our current architecture as:
- Colors come from `src/theme/colors.ts` (hardcoded)
- Chart data comes from validated stock APIs (numeric values)
- No user-supplied color values accepted

#### Mitigation Status

**Current Mitigations:**
- ✅ No user-supplied color values in application
- ✅ All colors defined in theme system
- ✅ Chart library usage isolated to visualization only
- ✅ Regular monitoring of npm audit reports

**No Fix Available:**
- npm audit shows "No fix available" as of 2025-11-16
- d3-color maintainers aware of issue
- Waiting for upstream patch

#### Recommended Actions

**Immediate:**
- [x] Document vulnerability and risk assessment
- [x] Add to security policy
- [x] Monitor npm audit in CI/CD

**Short-term (Next 30 days):**
- [ ] Check for d3-color updates weekly
- [ ] Monitor for alternative charting libraries
- [ ] Review CVE databases for assigned number

**Long-term (if no fix within 90 days):**
- [ ] Evaluate alternative charting solutions:
  - Victory Native (recommended)
  - Recharts
  - Custom SVG implementation
- [ ] Cost/benefit analysis of migration

#### Monitoring

```bash
# Check for updates
npm audit
npm outdated d3-color

# View dependency tree
npm ls d3-color
```

#### References

- npm audit report: 2025-11-16
- Severity: HIGH
- Package: d3-color
- Affected versions: <3.1.0
- Dependency path: react-native-svg-charts → d3-scale → d3-interpolate → d3-color

---

## Reporting Security Issues

If you discover a security vulnerability in this project, please email:
- **Email:** [Your security contact]
- **PGP Key:** [If applicable]

Please do NOT open public GitHub issues for security vulnerabilities.

---

## Security Best Practices

### Dependencies

1. **Regular Audits:** Run `npm audit` before each release
2. **Automated Scanning:** GitHub Dependabot enabled
3. **Update Policy:** Security patches applied within 7 days
4. **Version Pinning:** Critical deps pinned, others use ^

### Code Security

1. **Input Validation:** All external data validated
2. **No Secrets in Code:** Environment variables for sensitive data
3. **SQL Injection Prevention:** Parameterized queries only
4. **XSS Protection:** React Native escapes by default

### API Security

1. **API Keys:** Stored in Lambda environment variables
2. **Rate Limiting:** Handled by backend Lambda
3. **Authentication:** Public market data (no auth required)
4. **HTTPS:** All API calls over secure connections

---

**Last Updated:** 2025-11-16
**Next Review:** 2025-12-16

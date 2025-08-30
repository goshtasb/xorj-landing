# XORJ Trading Platform - Cloudflare Security Configuration

**Advanced DDoS Protection and Network-Level Security**

This document outlines the comprehensive security configuration for XORJ's production deployment using Cloudflare's enterprise-grade protection services.

## Overview

The security configuration implements multiple layers of protection:
- **DDoS Protection**: Advanced volumetric and application-layer attack mitigation
- **Web Application Firewall (WAF)**: OWASP ruleset with custom rules for trading platforms
- **Rate Limiting**: Multi-tier rate limiting across all API endpoints
- **Bot Management**: AI-powered bot detection and mitigation
- **Geographic Filtering**: Country-based access controls

## Zone Security Settings

```json
{
  "security_level": "high",
  "challenge_ttl": 1800,
  "browser_check": "on",
  "hotlink_protection": "on",
  "server_side_exclude": "on",
  "min_tls_version": 1.2,
  "tls_1_3": "on",
  "automatic_https_rewrites": "on",
  "ssl": "strict"
}
```

## Rate Limiting Rules

### 1. Authentication Endpoints Protection
- **Target**: `/api/auth/*`
- **Limit**: 5 requests per minute
- **Action**: Challenge with 1-hour timeout
- **Purpose**: Prevent brute force attacks on login/signup

### 2. Trading API Protection
- **Target**: `/api/bot/*`, `/api/vault/*`
- **Limit**: 30 requests per minute
- **Action**: Simulate (log) with progressive blocking
- **Purpose**: Prevent trading API abuse while allowing legitimate activity

### 3. General API Protection
- **Target**: `/api/*`
- **Limit**: 100 requests per minute
- **Action**: Challenge for 5 minutes
- **Purpose**: General API rate limiting

## Firewall Rules (Priority Order)

### High Priority - Block Immediately

1. **Malicious Path Blocking**
   ```
   (http.request.uri.path contains ".env") or 
   (http.request.uri.path contains "wp-admin") or 
   (http.request.uri.path contains "phpMyAdmin") or 
   (http.request.uri.path contains ".git") or 
   (http.request.uri.path contains "config.php")
   ```

2. **Request Size Limiting**
   ```
   http.request.body.size gt 10485760
   ```
   - Blocks requests larger than 10MB

### Medium Priority - Challenge Suspicious Traffic

3. **Suspicious User Agents**
   ```
   (http.user_agent contains "sqlmap") or 
   (http.user_agent contains "nmap") or 
   (http.user_agent contains "masscan") or 
   (http.user_agent contains "nikto") or 
   (http.user_agent eq "") or 
   (http.user_agent contains "python-requests") or 
   (http.user_agent contains "curl") or 
   (http.user_agent contains "wget")
   ```

4. **Geographic Security**
   ```
   (ip.geoip.country in {"CN" "RU" "KP" "IR"}) and 
   not (http.request.uri.path eq "/api/health")
   ```
   - Challenge high-risk countries (excluding health checks)

5. **Admin Endpoint Protection**
   ```
   http.request.uri.path contains "/api/admin" or 
   http.request.uri.path contains "/api/system"
   ```
   - JS Challenge for admin endpoints

## WAF Configuration

### Managed Rulesets
- **Cloudflare Managed Ruleset**: Enabled
- **OWASP Core Rule Set**: Enabled (Paranoia Level 2)
- **Exposed Credentials Check**: Enabled

### Custom WAF Rules

1. **SQL Injection Protection**
   ```
   any(http.request.body.form.values[*] contains sql.sqli) or 
   any(http.request.uri.args.values[*] contains sql.sqli) or 
   http.request.uri.query contains "union select" or 
   http.request.uri.query contains "drop table"
   ```

2. **XSS Protection**
   ```
   any(http.request.body.form.values[*] contains xss.libinjection) or 
   any(http.request.uri.args.values[*] contains xss.libinjection) or 
   http.request.uri.query contains "<script" or 
   http.request.uri.query contains "javascript:"
   ```

3. **Advanced API Rate Limiting**
   ```
   (http.request.uri.path matches "^/api/(bot|trading|vault)/.*$") and 
   (rate(1m) > 60)
   ```

4. **Brute Force Protection**
   ```
   (http.request.uri.path eq "/api/auth/login" or 
    http.request.uri.path eq "/api/auth/register") and 
   (rate(5m) > 10)
   ```

## DDoS Protection

### Settings
```json
{
  "enabled": true,
  "sensitivity": "high",
  "advanced_ddos_protection": {
    "enabled": true,
    "http_ddos_attack_protection": "on",
    "adaptive_ddos_protection": "on"
  }
}
```

### Coverage
- **Layer 3/4**: Network and transport layer protection
- **Layer 7**: Application layer HTTP/HTTPS attack mitigation
- **Adaptive Protection**: AI-powered attack pattern recognition

## Bot Management

### Configuration
```json
{
  "enabled": true,
  "fight_mode": true,
  "using_latest_model": true,
  "optimize_wordpress": false,
  "suppress_session_score": false,
  "auto_update_model": true,
  "enable_js": true
}
```

### Features
- **AI Bot Detection**: Machine learning-based bot identification
- **Behavioral Analysis**: Real-time user behavior scoring
- **Challenge Escalation**: Progressive challenges for suspicious behavior

## Load Balancing & Health Monitoring

### Pool Configuration
- **Primary Pool**: `xorj-api-pool`
- **Origins**: `api.xorj.com`
- **Health Check**: `GET /api/health` (200 expected)
- **Check Regions**: Western Europe, Eastern Europe, East North America
- **Interval**: 90 seconds
- **Timeout**: 10 seconds

## Analytics & Monitoring

### Enabled Analytics
- Web Analytics
- Zone Analytics
- Security Analytics
- Firewall Events (100% sampling)

### Alerting Rules

1. **DDoS Attack Detection**
   - **Trigger**: DDoS attack detected and mitigated
   - **Scope**: All zones (`xorj.com`, `api.xorj.com`)

2. **High Error Rate**
   - **Trigger**: 5xx error rate > 10% with >10 RPS
   - **Scope**: API endpoints

3. **Security Events**
   - **Trigger**: Blocked security threats
   - **Actions**: Block, Challenge, JS Challenge

## Deployment Instructions

### Prerequisites
1. Cloudflare Pro plan or higher
2. API tokens with Zone:Read, Zone:Edit, Page Rules:Edit permissions
3. DNS records pointing to Cloudflare nameservers
4. SSL certificate provisioned and active

### Deployment Steps
1. Apply zone settings via Cloudflare API or dashboard
2. Configure firewall rules in priority order
3. Set up rate limiting rules
4. Enable WAF managed rules
5. Configure custom WAF rules
6. Set up monitoring and alerting
7. Test security configuration with penetration testing
8. Monitor logs and adjust rules based on traffic patterns

### API Deployment Script

```bash
#!/bin/bash
# Cloudflare Security Configuration Deployment

ZONE_ID="your_zone_id"
API_TOKEN="your_api_token"
BASE_URL="https://api.cloudflare.com/client/v4"

# Apply security settings
curl -X PATCH "${BASE_URL}/zones/${ZONE_ID}/settings/security_level" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"value":"high"}'

# Add firewall rules
curl -X POST "${BASE_URL}/zones/${ZONE_ID}/firewall/rules" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @firewall-rules.json

# Configure rate limiting
curl -X POST "${BASE_URL}/zones/${ZONE_ID}/rate_limits" \
  -H "Authorization: Bearer ${API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @rate-limits.json
```

## Monitoring & Maintenance

### Daily Monitoring
- Review Security Events dashboard
- Check rate limiting effectiveness
- Monitor false positive rates
- Verify SSL certificate status

### Weekly Reviews
- Analyze traffic patterns for new threats
- Review and update geographic restrictions
- Assess rule effectiveness
- Check system performance impact

### Monthly Audits
- Complete security configuration review
- Update threat intelligence rules
- Performance optimization review
- Penetration test preparation

## Emergency Procedures

### DDoS Attack Response
1. Verify attack detection in Cloudflare dashboard
2. Enable "Under Attack Mode" if needed
3. Monitor origin server health
4. Coordinate with incident response team
5. Document attack patterns for future prevention

### False Positive Mitigation
1. Identify affected traffic patterns
2. Create temporary bypass rules if needed
3. Adjust rule sensitivity
4. Monitor for continued issues
5. Update documentation

## Security Metrics & KPIs

### Key Metrics to Monitor
- **Attack Mitigation Rate**: % of attacks successfully blocked
- **False Positive Rate**: < 0.1% of legitimate traffic
- **Response Time Impact**: < 50ms additional latency
- **Availability**: 99.99% uptime for API endpoints
- **Error Rate**: < 1% 5xx errors under normal conditions

### Performance Baselines
- **API Response Time**: < 200ms average
- **Security Processing**: < 50ms additional overhead
- **Cache Hit Rate**: > 90% for cacheable content
- **Origin Traffic**: < 10% increase due to security processing

---

**Document Status**: Production Ready  
**Last Updated**: August 2025  
**Version**: 1.0  
**Security Review**: Approved for production deployment
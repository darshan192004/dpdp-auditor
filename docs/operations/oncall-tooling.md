# On-Call Tooling Configuration (P6-14)

**Status:** ✅ Configuration documented.

## Overview

This document defines the on-call tooling configuration for DPDPA Auditor, including PagerDuty rotation, status page pipeline, and security contact setup.

## On-Call Rotation

### PagerDuty Configuration

**Schedule:** Weekly rotation with primary and secondary on-call.

```yaml
# .pagerduty/config.yml
schedules:
  - name: "Platform On-Call"
    timezone: "Asia/Kolkata"
    rotation_virtual_start: "2026-01-01T00:00:00+05:30"
    rotation_turn_length: 1 week
    layers:
      - name: "Primary"
        rotation_virtual_start: "2026-01-01T10:00:00+05:30"
        rotation_turn_length: 1 week
        users:
          - platform-lead-1
          - platform-lead-2
          - platform-engineer-1
          - platform-engineer-2
      - name: "Secondary"
        rotation_virtual_start: "2026-01-01T10:00:00+05:30"
        rotation_turn_length: 1 week
        users:
          - cto
          - senior-engineer-1

escalation_policies:
  - name: "Platform Incidents"
    escalation_rules:
      - delay_minutes: 0
        targets:
          - schedule: "Platform On-Call"
            level: primary
      - delay_minutes: 15
        targets:
          - schedule: "Platform On-Call"
            level: secondary
      - delay_minutes: 30
        targets:
          - user: cto
```

### Alert Routing

| Alert Severity | Routing | Escalation |
|---|---|---|
| Critical (SLO burn) | Page primary immediately | 15min → secondary, 30min → CTO |
| High (service degraded) | Page primary | 30min → secondary, 1h → CTO |
| Medium (warning) | Email + Slack | 4h → primary page |
| Low (info) | Slack only | No escalation |

### On-Call Handbook

**Responsibilities:**
1. **Monitor alerts**: Respond to pages within 15 minutes
2. **Triage incidents**: Assess severity, declare incidents when needed
3. **Execute runbooks**: Follow documented procedures
4. **Communicate**: Update status page, notify stakeholders
5. **Document**: File incident reports, update runbooks

**Handoff Procedure:**
1. **Weekly handoff meeting** (Monday 10:00 IST)
2. **Review active incidents**: Status, next steps, pending actions
3. **Review recent changes**: Deployments, config changes, known issues
4. **Update on-call doc**: Current state, watch items, contacts

**Compensation:**
- On-call allowance: ₹X,XXX per week
- Night/weekend pages: Compensatory time off
- Post-incident: 1 day recovery time after major incidents

---

## Status Page Pipeline

### Architecture

```
SLO Metrics (Prometheus)
       ↓
Grafana Alerts
       ↓
Statuspage.io API
       ↓
Public Status Page (status.dpdpa.example)
```

### Component Health

| Component | Metric | Threshold | Status Mapping |
|---|---|---|---|
| API | Error rate | > 1% = degraded, > 5% = outage | operational → degraded → outage |
| Scans | Queue depth | > 100 = degraded, > 500 = outage | operational → degraded → outage |
| Reports | Generation latency | p95 > 30s = degraded | operational → degraded |
| Dashboard | Uptime | Unreachable = outage | operational → outage |

### Automated Status Updates

```yaml
# .github/workflows/status-page.yml
name: Status Page Updates

on:
  workflow_run:
    workflows: ["SLO Monitoring"]
    types:
      - completed

jobs:
  update-status:
    runs-on: ubuntu-latest
    steps:
      - name: Fetch SLO status
        run: |
          curl -s https://grafana.dpdpa.example/api/slo/status \
            | jq '.components[] | select(.status != "operational")' \
            > degraded-components.json

      - name: Update Statuspage
        if: ${{ steps.fetch.outputs.degraded != '[]' }}
        run: |
          curl -X POST https://api.statuspage.io/v1/pages/${{ secrets.STATUSPAGE_ID }}/incidents \
            -H "Authorization: OAuth ${{ secrets.STATUSPAGE_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d @degraded-components.json
```

### Manual Status Updates

**When to update manually:**
- Scheduled maintenance
- Known issues not yet detected by monitoring
- Customer-reported issues before alert fires
- Security incidents (with appropriate disclosure level)

**Procedure:**
1. Log in to Statuspage.io admin dashboard
2. Click "Add Incident"
3. Select affected components
4. Write clear, customer-friendly message
5. Set status (investigating → identified → monitoring → resolved)
6. Update every 30 minutes until resolved

---

## Security Contact Setup

### Email Configuration

**Primary contact:** `security@dpdpa.example`

**Routing:**
```
security@dpdpa.example
  → security-lead@dpdpa.example (primary)
  → cto@dpdpa.example (secondary)
  → #security-alerts (Slack channel)
```

**Auto-responder:**
```
Subject: Re: [Security Report] {{subject}}

Thank you for reporting a security concern.

Your report has been received and will be reviewed by our security team
within 24 hours. For urgent matters, please page our on-call engineer
via PagerDuty.

Expected response timeline:
- Critical/active exploit: Within 4 hours
- High severity: Within 24 hours
- Medium/Low severity: Within 72 hours

If you reported a vulnerability, please do not disclose publicly until
we have had a chance to investigate and deploy a fix.

— DPDPA Security Team
```

### Security.txt

**Location:** `https://dpdpa.example/.well-known/security.txt`

```
Contact: mailto:security@dpdpa.example
Expires: 2027-12-31T23:59:59Z
Encryption: https://dpdpa.example/.well-known/pgp-key.txt
Preferred-Languages: en, hi
Canonical: https://dpdpa.example/.well-known/security.txt
Policy: https://dpdpa.example/security/vulnerability-disclosure-policy
Hiring: https://dpdpa.example/careers
```

### Vulnerability Disclosure Policy

**Published at:** `https://dpdpa.example/security/vulnerability-disclosure-policy`

**Key points:**
1. **Safe harbor**: We will not pursue legal action for good-faith research
2. **Response timeline**: 24h acknowledgment, 72h initial response
3. **Bounty program**: ₹XX,XXX - ₹X,XX,XXX based on severity
4. **Disclosure**: Coordinated disclosure after fix deployed
5. **Scope**: All dpdpa.example domains and applications

---

## Monitoring & Alerting Integration

### Prometheus Alert Rules

```yaml
# monitoring/prometheus/alerts.yml
groups:
  - name: oncall
    interval: 30s
    rules:
      - alert: SLOErrorBudgetBurn
        expr: |
          (
            sum(rate(http_errors_total{job="orchestrator"}[5m]))
            /
            sum(rate(http_requests_total{job="orchestrator"}[5m]))
          ) > 0.01
        for: 5m
        labels:
          severity: critical
          team: platform
        annotations:
          summary: "Error budget burning too fast"
          description: "Error rate is {{ $value | humanizePercentage }} (threshold 1%)"
          runbook_url: "https://github.com/dpdpa-auditor/dpdp-auditor/blob/main/docs/runbooks/scan-failure.md"

      - alert: ScanQueueBacklog
        expr: |
          scan_queue_depth > 100
        for: 10m
        labels:
          severity: high
          team: platform
        annotations:
          summary: "Scan queue backlog growing"
          description: "Queue depth is {{ $value }} (threshold 100)"
          runbook_url: "https://github.com/dpdpa-auditor/dpdp-auditor/blob/main/docs/runbooks/scan-failure.md"
```

### Grafana Dashboards

| Dashboard | Purpose | Link |
|---|---|---|
| Platform SLO | Error budget, latency, availability | Grafana: Platform SLO |
| Scan Health | Queue depth, completion times, failures | Grafana: Scan Health |
| Infrastructure | CPU, memory, disk, network | Grafana: Infra |
| Security | Auth failures, SSRF attempts, rate limits | Grafana: Security |

### Slack Integration

**Channels:**
- `#platform-alerts`: All automated alerts (read-only for most, on-call responds)
- `#platform-oncall`: On-call handoff, coverage questions
- `#security-alerts`: Security-specific alerts (restricted access)
- `#incident-response`: Active incident coordination (created per-incident)

**Alert formatting:**
```json
{
  "text": "🚨 CRITICAL: SLOErrorBudgetBurn",
  "attachments": [
    {
      "color": "danger",
      "fields": [
        { "title": "Service", "value": "orchestrator", "short": true },
        { "title": "Error Rate", "value": "2.3%", "short": true },
        { "title": "Runbook", "value": "<https://.../scan-failure.md|View>", "short": false }
      ],
      "actions": [
        {
          "type": "button",
          "text": "Acknowledge",
          "url": "https://pagerduty.com/incidents/XXXXX/acknowledge"
        },
        {
          "type": "button",
          "text": "Escalate",
          "url": "https://pagerduty.com/incidents/XXXXX/escalate"
        }
      ]
    }
  ]
}
```

---

## Runbook References

| Runbook | Purpose | Location |
|---|---|---|
| On-call handoff | Weekly rotation procedure | `docs/runbooks/oncall-handoff.md` |
| Incident declaration | When and how to declare | `docs/runbooks/incident-declaration.md` |
| Status page updates | Manual update procedure | `docs/runbooks/status-page.md` |
| Security triage | Vulnerability report handling | `docs/runbooks/security-triage.md` |
| Escalation | When to page secondary/CTO | `docs/runbooks/escalation.md` |

---

## Implementation Checklist

- [x] PagerDuty schedule configured
- [x] Escalation policy defined
- [x] Statuspage.io integration set up
- [x] `security@dpdpa.example` email configured
- [x] Security.txt published
- [x] Vulnerability disclosure policy live
- [ ] First on-call rotation starts: 2026-12-01
- [ ] On-call handbook distributed to team
- [ ] Slack alert channels created
- [ ] Grafana dashboards shared with team

---

## Review Schedule

| Review Type | Frequency | Next Due |
|---|---|---|
| Escalation policy review | Quarterly | 2027-02-17 |
| On-call satisfaction survey | Monthly | 2026-12-17 |
| Status page accuracy audit | Monthly | 2026-12-17 |
| Security contact test | Quarterly | 2027-02-17 |

---

**Document owner:** Platform Lead  
**Last updated:** 2026-11-17  
**Next review:** 2027-02-17

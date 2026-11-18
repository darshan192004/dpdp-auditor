# Incident Response Tabletop Exercise (P6-12)

**Status:** ✅ Exercise documented and scheduled.

## Overview

This document defines the incident response tabletop exercise for DPDPA Auditor. It tests our ability to detect, respond to, and recover from security and operational incidents.

## Exercise Objectives

1. **Validate detection**: Can we identify the incident from alerts?
2. **Test runbooks**: Do the runbooks provide clear, actionable steps?
3. **Measure response time**: How quickly can we contain and remediate?
4. **Identify gaps**: What's missing from our tooling or documentation?
5. **Practice communication**: How do we coordinate during an incident?

## Exercise Scenarios

### Scenario 1: Data Breach via SSRF

**Inject:** Security researcher reports they extracted customer data via SSRF vulnerability in scan-runner.

**Timeline:**
- T+0: Alert fires on `SSRFAnomalyDetected` (unusual outbound connections from runner)
- T+5min: Security researcher emails `security@dpdpa.example`
- T+15min: On-call acknowledges page
- T+30min: Incident commander declared
- T+1h: Containment plan approved
- T+2h: All runners rotated, vulnerable code path disabled
- T+4h: Customer notification drafted
- T+24h: Post-mortem scheduled

**Discussion Questions:**
1. Who receives the security researcher email?
2. How do we verify the claim?
3. What's the containment strategy?
4. Which customers are affected?
5. What's the legal notification requirement?

**Expected Actions:**
- [ ] Page security lead + CTO immediately
- [ ] Preserve logs from affected time window
- [ ] Disable SSRF-prone code path (feature flag)
- [ ] Rotate all runner credentials
- [ ] Audit all scans from past 7 days for similar patterns
- [ ] Draft customer notification per DPA §12.3
- [ ] File incident report within 72 hours

**Success Criteria:**
- Incident detected within 15 minutes
- Containment plan executed within 2 hours
- All affected customers notified within 72 hours
- Root cause identified and fixed

---

### Scenario 2: Mass Scan Failure (GitHub Outage)

**Inject:** GitHub API returns 403 for all scan requests for 2 hours.

**Timeline:**
- T+0: GitHub API starts returning 403 rate limit errors
- T+5min: `GitHubRateLimited` alert fires
- T+10min: Scans begin queuing, customers report delays
- T+30min: On-call investigates, confirms GitHub-wide issue
- T+1h: Status page updated to "degraded"
- T+2h: GitHub API recovers
- T+3h: Backlog cleared, all scans completed
- T+4h: Post-incident review scheduled

**Discussion Questions:**
1. How do we communicate with affected customers?
2. Do we pause scan submissions or let them queue?
3. What's the SLA impact?
4. When do we update the status page?
5. How do we clear the backlog efficiently?

**Expected Actions:**
- [ ] Acknowledge alert within 10 minutes
- [ ] Update status page to "degraded performance"
- [ ] Send in-app notification to customers with queued scans
- [ ] Monitor queue depth, scale runners if needed
- [ ] Document GitHub outage duration and impact
- [ ] Review SLA credits for affected customers
- [ ] Post-incident: consider multi-mirror approach (GitLab, etc.)

**Success Criteria:**
- Status page updated within 30 minutes
- No scans lost, all eventually completed
- Customer complaints < 5% of affected scans
- Backlog cleared within 4 hours of recovery

---

### Scenario 3: Database Corruption

**Inject:** Postgres primary fails over, but 15 minutes of data is lost (exceeds RPO).

**Timeline:**
- T+0: Postgres primary becomes unresponsive
- T+2min: `PostgresDown` alert fires
- T+5min: Automatic failover to replica begins
- T+10min: Failover complete, but data loss detected
- T+15min: On-call realizes RPO violated (15 min > 15 min target)
- T+30min: Incident commander declares major incident
- T+1h: Customer impact assessment complete
- T+2h: Data recovery plan approved (restore from backup)
- T+4h: Restore complete, data validated
- T+6h: Service fully restored
- T+24h: Post-mortem scheduled

**Discussion Questions:**
1. How do we detect data loss?
2. Who decides to restore from backup?
3. What's the customer communication plan?
4. How do we validate data integrity post-restore?
5. What's the SLA impact of RPO violation?

**Expected Actions:**
- [ ] Page platform lead + CTO immediately
- [ ] Assess data loss scope (which scans/findings lost?)
- [ ] Identify affected customers
- [ ] Decide: restore from backup vs. accept data loss
- [ ] If restore: provision restore environment, validate data
- [ ] Draft customer notification per DPA §8.2
- [ ] Review backup frequency (consider continuous archiving)
- [ ] File incident report within 72 hours

**Success Criteria:**
- Data loss detected within 15 minutes
- Restore decision made within 1 hour
- Service restored within 6 hours
- All affected customers notified and compensated

---

### Scenario 4: False Positive Storm

**Inject:** Rule pack update causes 500+ false positive findings across all customers.

**Timeline:**
- T+0: Rule pack v2.3.0 deployed
- T+30min: First false positive reports from customers
- T+1h: Support tickets spike (50+ in 1 hour)
- T+2h: Pattern recognized: all FP from new rule `DPDPA-8.4-ENC-03`
- T+3h: Rule disabled via feature flag
- T+4h: Customers notified of fix
- T+24h: Rule pack v2.3.1 released with corrected rule
- T+48h: Post-mortem published

**Discussion Questions:**
1. How do we detect a false positive storm?
2. What's the rollback process for a rule pack?
3. How do we communicate with affected customers?
4. Do we proactively reach out or wait for tickets?
5. How do we prevent this in the future?

**Expected Actions:**
- [ ] Monitor support ticket volume + sentiment
- [ ] Identify common pattern (which rule, which customers?)
- [ ] Disable problematic rule via feature flag
- [ ] Send proactive email to all affected customers
- [ ] Offer SLA credit for disruption
- [ ] Fix rule, release v2.3.1 with legal review
- [ ] Add false positive detection to rule pack CI
- [ ] Publish post-mortem (transparency builds trust)

**Success Criteria:**
- False positive pattern identified within 2 hours
- Problematic rule disabled within 3 hours
- All affected customers notified within 4 hours
- No customer churn due to incident

---

### Scenario 5: Credential Leak in Logs

**Inject:** Customer API key found in plaintext in orchestrator logs.

**Timeline:**
- T+0: Log aggregation system detects credential pattern
- T+5min: `CredentialLeakDetected` alert fires
- T+10min: On-call investigates, confirms leak
- T+15min: Leaked credential rotated immediately
- T+30min: Log entries purged from aggregation system
- T+1h: Root cause identified (missing redaction rule)
- T+2h: Redaction rule deployed
- T+4h: Customer notified of leak and rotation
- T+24h: Audit all historical logs for similar leaks

**Discussion Questions:**
1. How do we detect credential leaks?
2. Who has authority to rotate customer credentials?
3. How do we purge logs from third-party systems?
4. What's the customer notification process?
5. How do we prevent future leaks?

**Expected Actions:**
- [ ] Rotate leaked credential immediately (automated if possible)
- [ ] Purge log entries from all aggregation systems
- [ ] Identify root cause (which code path leaked?)
- [ ] Deploy redaction fix
- [ ] Notify affected customer with remediation steps
- [ ] Audit all historical logs for similar patterns
- [ ] Add leak detection to CI (gitleaks + custom patterns)
- [ ] File incident report within 72 hours

**Success Criteria:**
- Credential rotated within 15 minutes
- Logs purged within 30 minutes
- Customer notified within 4 hours
- No recurrence after fix deployed

---

## Exercise Schedule

| Date | Scenario | Participants | Duration | Result |
|---|---|---|---|---|
| 2026-11-17 | Scenario 1: SSRF breach | Security, Platform, Legal | 2h | ⏳ Scheduled |
| 2026-12-17 | Scenario 2: GitHub outage | Platform, Support | 1h | ⏳ Scheduled |
| 2027-01-17 | Scenario 3: DB corruption | Platform, Security | 2h | ⏳ Scheduled |
| 2027-02-17 | Scenario 4: FP storm | Product, Security, Support | 1h | ⏳ Scheduled |
| 2027-03-17 | Scenario 5: Credential leak | Security, Platform | 1h | ⏳ Scheduled |

## Exercise Format

**Preparation (1 week before):**
1. Select scenario and injects
2. Identify participants (on-call, security, legal, support)
3. Prepare monitoring dashboards (simulated alerts)
4. Set up communication channel (Slack war room)

**Execution (exercise day):**
1. **Briefing (15 min)**: Review scenario, rules, objectives
2. **Inject phase (30-60 min)**: Present injects one at a time
3. **Response phase (30-60 min)**: Participants respond as if real
4. **Debrief (30 min)**: What went well, what needs improvement

**Follow-up (1 week after):**
1. Document lessons learned
2. Create action items for gaps identified
3. Update runbooks based on findings
4. Schedule re-test if critical gaps found

## Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| Time to detect | < 15 minutes | Alert timestamp → acknowledgment |
| Time to contain | < 2 hours | Acknowledgment → containment plan executed |
| Time to resolve | < 24 hours | Acknowledgment → service restored |
| Customer notification | < 72 hours | Incident start → customer email sent |
| Runbook accuracy | 100% | Steps followed without deviation |
| Action items closed | 100% within 30 days | Post-exercise tasks completed |

## Action Item Tracker

| Exercise Date | Scenario | Action Items | Owner | Due Date | Status |
|---|---|---|---|---|---|
| 2026-11-17 | SSRF breach | Add SSRF detection to runners | Platform | 2026-12-17 | ⏳ Open |
| 2026-11-17 | SSRF breach | Update DPA breach notification template | Legal | 2026-12-17 | ⏳ Open |

## Sign-off

| Role | Name | Date |
|---|---|---|
| Exercise lead | — | TBD |
| Security lead | — | TBD |
| Platform lead | — | TBD |
| Legal counsel | — | TBD |

**Next exercise:** 2026-11-17 (Scenario 1: SSRF breach)

# False Positive Review Analysis (P6-18)

**Status:** ✅ Analysis framework created.

## Overview

This document defines the false positive (FP) review process and acceptance criteria for P6-18: sample 100 findings; rate below 15%.

## Definitions

| Term | Definition |
|---|---|
| **False Positive** | A finding that does not represent an actual DPDPA control violation or applicability issue |
| **True Positive** | A finding that correctly identifies a DPDPA control violation or gap |
| **FP Rate** | (False Positives / Total Findings Sampled) × 100 |
| **Mapping Miss** | A scanner finding that was not mapped to any DPDPA control (tracked separately) |

## Acceptance Criteria

**P6-18 Target:** False positive rate < 15% on a sample of 100 findings.

| Metric | Target | Measurement |
|---|---|---|
| Sample size | 100 findings | Random sample across all scans |
| FP rate | < 15% | (FP count / 100) × 100 |
| Confidence level | 95% | Statistical confidence interval |
| Severity weighting | Critical/High findings reviewed first | Prioritized sampling |

## Sampling Methodology

### Stratified Random Sampling

To ensure representative coverage, sample findings are stratified by:

1. **Severity** (critical, high, medium, low, info)
2. **Control section** (8(4), 6, 5, 7, 9, 10, 13, 8(5), 16)
3. **Scanner** (Semgrep, Checkov, Gitleaks)
4. **Repository type** (web app, infra, mobile, docs)

**Sample Distribution:**

| Stratum | Population % | Sample Count |
|---|---|---|
| Critical | 5% | 5 |
| High | 20% | 20 |
| Medium | 40% | 40 |
| Low | 25% | 25 |
| Info | 10% | 10 |
| **Total** | 100% | **100** |

### Review Cadence

| Review Type | Frequency | Sample Size | Owner |
|---|---|---|---|
| Weekly FP triage | Weekly | 20 findings | Product lead |
| Monthly FP review | Monthly | 100 findings | Security + Legal |
| Quarterly FP audit | Quarterly | 200 findings | External reviewer |
| Pre-launch review | Before launch | 100 findings | Legal counsel |

## FP Classification

### FP Categories

When reviewing a finding, classify as:

| Category | Code | Description |
|---|---|---|
| True Positive | TP | Correctly identified issue |
| False Positive - Not Applicable | FP-NA | Control does not apply to this repo type |
| False Positive - Incorrect Mapping | FP-MAP | Finding mapped to wrong control |
| False Positive - Scanner Error | FP-SCAN | Scanner misidentified pattern |
| False Positive - Context Missing | FP-CTX | Scanner lacks context (e.g., external control) |
| Uncertain | UNC | Requires further investigation |

### FP Examples

**FP-NA (Not Applicable):**
- Finding: "Missing encryption at rest" on a static HTML repo
- Reason: No data storage, encryption control not applicable
- Action: Update `appliesWhen` logic for encryption controls

**FP-MAP (Incorrect Mapping):**
- Finding: "Hardcoded secret" mapped to DPDPA-8.4-ENC-01 (encryption)
- Reason: Should map to DPDPA-8.4-SEC-03 (credential management)
- Action: Fix mapping rule in rule-pack

**FP-SCAN (Scanner Error):**
- Finding: "AWS key detected" in a commented-out code block
- Reason: Gitleaks matched pattern in non-executable context
- Action: Improve scanner regex or add exclusion pattern

**FP-CTX (Context Missing):**
- Finding: "Missing privacy notice" when notice exists at org level
- Reason: Scanner only checks repo, not org-level documents
- Action: Add org-level notice detection or mark as "verify manually"

## Review Process

### Step 1: Sample Selection

```bash
# Generate random sample of 100 findings
pnpm exec vitest run --reporter=json apps/orchestrator/test/fp-review.test.ts \
  | jq '.testResults[].assertions' \
  | shuf -n 100 \
  > fp-sample-$(date +%Y%m%d).json
```

### Step 2: Individual Review

For each finding in the sample:

1. **Review finding details**:
   - Control code and description
   - Scanner rule that matched
   - File path and matched snippet
   - Severity and status

2. **Determine applicability**:
   - Does the control apply to this repo type?
   - Is the scanner pattern correct?
   - Is there context the scanner missed?

3. **Classify finding**:
   - TP: Correctly identified
   - FP-NA: Control not applicable
   - FP-MAP: Wrong control mapping
   - FP-SCAN: Scanner error
   - FP-CTX: Missing context
   - UNC: Needs investigation

4. **Document rationale**:
   - Why is this a FP (if applicable)?
   - What would fix it (rule change, scanner config, etc.)?

### Step 3: Aggregate Results

```
Sample Size: 100 findings
Review Date: 2026-11-17
Reviewers: Product Lead, Security Lead

Results:
- True Positives: 87
- False Positives: 13
  - FP-NA: 5
  - FP-MAP: 3
  - FP-SCAN: 3
  - FP-CTX: 2
- Uncertain: 0

FP Rate: 13% (target: <15%) ✅ PASS
```

### Step 4: Action Items

For each FP category, create remediation tasks:

| FP Category | Remediation | Owner | Priority |
|---|---|---|---|
| FP-NA | Update `appliesWhen` logic | Engineering | High |
| FP-MAP | Fix mapping rules | Product + Legal | High |
| FP-SCAN | Tune scanner patterns | Security | Medium |
| FP-CTX | Add context detection | Engineering | Medium |

## FP Rate Tracking

### Historical FP Rates

| Review Date | Sample Size | FP Count | FP Rate | Status |
|---|---|---|---|---|
| 2026-11-17 | 100 | TBD | TBD | ⏳ Pending |
| 2026-12-17 | 100 | — | — | ⏳ Scheduled |
| 2027-01-17 | 100 | — | — | ⏳ Scheduled |

### FP Rate by Severity

| Severity | TP | FP | FP Rate |
|---|---|---|---|
| Critical | TBD | TBD | TBD |
| High | TBD | TBD | TBD |
| Medium | TBD | TBD | TBD |
| Low | TBD | TBD | TBD |
| Info | TBD | TBD | TBD |

### FP Rate by Control Section

| Section | TP | FP | FP Rate |
|---|---|---|---|
| 8(4) Encryption | TBD | TBD | TBD |
| 6 Access Control | TBD | TBD | TBD |
| 5 Security | TBD | TBD | TBD |
| 7 Logging | TBD | TBD | TBD |
| 9 Notices | TBD | TBD | TBD |
| 10 Rights | TBD | TBD | TBD |
| 13 Transfers | TBD | TBD | TBD |
| 8(5) Retention | TBD | TBD | TBD |
| 16 Accountability | TBD | TBD | TBD |

## FP Reduction Workflow

### When FP Rate > 15%

1. **Immediate action**: Pause rule pack deployment
2. **Root cause analysis**: Identify top FP sources
3. **Fix prioritization**: Address highest-impact FPs first
4. **Re-test**: New sample of 100 findings
5. **Deploy**: Only after FP rate < 15%

### Continuous Improvement

- **Weekly**: Review top 10 FP sources
- **Monthly**: Update mapping rules based on FP patterns
- **Quarterly**: External audit of FP classification accuracy
- **Pre-launch**: Legal review of all FP-NA and FP-MAP findings

## Automated FP Detection

### FP Indicators

Monitor these metrics to detect FP spikes:

| Metric | Threshold | Alert |
|---|---|---|
| FP-NA rate > 20% | High | `HighFPNotApplicableRate` |
| FP-MAP rate > 10% | Medium | `MappingErrorRateHigh` |
| FP-SCAN rate > 10% | Medium | `ScannerFalsePositiveRate` |
| Overall FP rate > 15% | Critical | `FalsePositiveRateExceeded` |

### Monitoring Queries

```sql
-- FP rate by control section (last 7 days)
SELECT
  control_section,
  COUNT(*) FILTER (WHERE status = 'false_positive')::float / COUNT(*) AS fp_rate
FROM findings
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY control_section
ORDER BY fp_rate DESC;

-- FP rate trend (last 30 days)
SELECT
  DATE(created_at) AS review_date,
  COUNT(*) FILTER (WHERE status = 'false_positive')::float / COUNT(*) AS fp_rate
FROM findings
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY review_date;
```

## Sign-off

| Role | Name | Date | FP Rate | Status |
|---|---|---|---|---|
| Product lead | — | TBD | TBD | ⏳ Pending |
| Security lead | — | TBD | TBD | ⏳ Pending |
| Legal counsel | — | TBD | TBD | ⏳ Pending |

**Next review due:** 2026-12-17 (monthly)

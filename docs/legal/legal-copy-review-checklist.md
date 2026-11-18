# Legal Copy Review Checklist (P6-19)

**Status:** ✅ Checklist created.

## Overview

This checklist ensures all UI text, PDF reports, and customer-facing communications comply with `rules.md` §15 (Disclaimer and Legal Language Requirements).

## Review Scope

| Content Type | Location | Review Required |
|---|---|---|
| UI disclaimers | `apps/web/src/components/` | Every screen with findings/scores |
| PDF reports | `apps/orchestrator/src/modules/reports/` | Header, footer, methodology section |
| Email notifications | `apps/orchestrator/src/modules/reports/email.service.ts` | All templates |
| API error messages | `apps/orchestrator/src/common/api-error.ts` | User-facing errors |
| Marketing copy | `apps/web/src/pages/` | Pricing, features, security claims |
| Documentation | `docs/` | Quickstart, security package, DPA |
| Terms of Service | `apps/web/src/pages/legal/` | ToS, privacy policy |

---

## rules.md §15 Requirements

### 15.1 Mandatory Disclaimer

**Requirement:** Every report must include the following disclaimer:

> "The mapping is a technical aid. It is not legal advice, not a legal opinion, and not a certification of compliance. DPDPA obligations depend on facts outside the repository, including notices, consents, contracts, and processing purposes. Customers must validate findings with qualified counsel."

**Checklist:**
- [ ] Disclaimer appears on PDF report cover page
- [ ] Disclaimer appears in report footer (every page)
- [ ] Disclaimer appears in email notification body
- [ ] Disclaimer appears in UI when viewing findings
- [ ] Disclaimer is prominently visible (not hidden in fine print)
- [ ] Disclaimer uses clear, readable font (minimum 10pt in PDF)

**Location:** `apps/orchestrator/src/modules/reports/report-view-model.ts`

```typescript
export const REPORT_DISCLAIMER =
  'The mapping is a technical aid. It is not legal advice, not a legal opinion, and not a ' +
  'certification of compliance. DPDPA obligations depend on facts outside the repository, ' +
  'including notices, consents, contracts, and processing purposes. Customers must validate ' +
  'findings with qualified counsel.';
```

**Status:** ✅ Implemented

---

### 15.2 Score Interpretation Guidance

**Requirement:** Scores must not be presented as compliance certification.

**Checklist:**
- [ ] Grade (A/B/C/D/F) is never called "compliance score"
- [ ] UI uses "DPDPA Alignment Score" or "Rule Pack Score"
- [ ] Marketing does not claim "certified compliant" or "DPDPA certified"
- [ ] Sales materials include disclaimer language
- [ ] API documentation clarifies score is technical assessment only

**Prohibited Language:**
- ❌ "Compliance score: 85%"
- ❌ "Certified DPDPA compliant"
- ❌ "Pass/fail certification"
- ✅ "DPDPA alignment score: 85/100"
- ✅ "Rule pack assessment: Grade B"
- ✅ "Technical findings mapped to DPDPA controls"

**Status:** ✅ Implemented (check `apps/web/src/components/score-display.tsx`)

---

### 15.3 Findings Language

**Requirement:** Findings are technical observations, not legal violations.

**Checklist:**
- [ ] Findings use "potential issue" not "violation"
- [ ] Severity is "critical/high/medium/low" not "non-compliant"
- [ ] Recommendations are "remediation guidance" not "legal requirements"
- [ ] Control mappings are "technical mapping" not "legal determination"

**Example Language:**

| Instead of | Use |
|---|---|
| "Violation of DPDPA §8(4)" | "Potential issue: DPDPA §8(4) control may apply" |
| "Non-compliant: Missing encryption" | "Finding: Encryption at rest not detected" |
| "Required: Implement access logging" | "Recommendation: Consider access logging per DPDPA §7" |
| "Failed: Privacy notice absent" | "Observation: Privacy notice not found in repository" |

**Status:** ✅ Implemented (check `apps/web/src/components/finding-detail.tsx`)

---

### 15.4 Marketing and Sales Claims

**Requirement:** No overstatement of capabilities or compliance guarantees.

**Checklist:**
- [ ] Website does not claim "guaranteed compliance"
- [ ] No "certified" or "certification" language
- [ ] Pricing page includes disclaimer
- [ ] Security page accurately describes security measures
- [ ] Case studies do not imply compliance certification
- [ ] Demo environments include disclaimer

**Prohibited Claims:**
- ❌ "Guarantee DPDPA compliance"
- ❌ "Certified compliance platform"
- ❌ "Avoid all DPDPA penalties"
- ✅ "Technical assessment aligned to DPDPA rules"
- ✅ "Automated security and privacy scanning"
- ✅ "Findings mapped to DPDPA control framework"

**Review Locations:**
- [ ] `apps/web/src/pages/index.tsx` (hero section)
- [ ] `apps/web/src/pages/pricing.tsx` (value propositions)
- [ ] `apps/web/src/pages/security.tsx` (security claims)
- [ ] `apps/web/src/pages/about.tsx` (company claims)

**Status:** ⏳ Needs review

---

### 15.5 Customer Communications

**Requirement:** All customer-facing communications include appropriate disclaimers.

**Checklist:**
- [ ] Email notifications include disclaimer
- [ ] Scan completion emails clarify technical nature
- [ ] Report ready emails reference disclaimer
- [ ] Support responses do not provide legal advice
- [ ] Changelog does not claim compliance improvements

**Email Template Review:**

```typescript
// apps/orchestrator/src/modules/reports/email.service.ts

// ✅ Report Ready Email
const reportReadyEmail = `
Your DPDPA scan report is ready.

View Report: ${reportUrl}

${REPORT_DISCLAIMER}

— DPDPA Auditor
`;

// ✅ Scan Completed Email
const scanCompletedEmail = `
Scan completed for ${repoName}.

Score: ${score}/100 (Grade: ${grade})

${REPORT_DISCLAIMER}

— DPDPA Auditor
`;
```

**Status:** ✅ Implemented

---

### 15.6 API and Developer Documentation

**Requirement:** API documentation clarifies technical vs. legal nature.

**Checklist:**
- [ ] API docs include disclaimer in introduction
- [ ] Score/grade fields documented as technical assessment
- [ ] Example responses include disclaimer
- [ ] SDK documentation repeats disclaimer
- [ ] OpenAPI spec includes disclaimer in description

**Location:** `docs/api-reference.md`

**Status:** ⏳ Needs review

---

### 15.7 Terms of Service and Privacy Policy

**Requirement:** ToS and privacy policy accurately describe service limitations.

**Checklist:**
- [ ] ToS includes limitation of liability
- [ ] ToS clarifies service is technical tool, not legal advice
- [ ] Privacy policy accurately describes data handling
- [ ] DPA (Data Processing Addendum) available for customers
- [ ] Subprocessor list published and updated

**Review Locations:**
- [ ] `apps/web/src/pages/legal/terms.tsx`
- [ ] `apps/web/src/pages/legal/privacy.tsx`
- [ ] `docs/security/dpa.md`
- [ ] `docs/security/subprocessors.md`

**Status:** ⏳ Needs review

---

## Review Process

### Initial Review (Before Launch)

1. **Legal counsel review**: All §15 requirements verified
2. **Product review**: UI/UX implements disclaimers correctly
3. **Engineering review**: Code matches legal requirements
4. **Sign-off**: Legal, Product, Engineering approve

### Ongoing Review (Quarterly)

1. **Content audit**: All customer-facing text reviewed
2. **Marketing review**: New campaigns checked for compliance language
3. **Support review**: Common responses reviewed for legal accuracy
4. **Update disclaimers**: Refresh based on regulatory changes

### Trigger-Based Review

Review required when:
- New feature launches (especially scoring/grading)
- Marketing campaign created
- Pricing or packaging changes
- Regulatory updates to DPDPA
- Customer complaints about misleading claims

---

## Action Items

| Item | Owner | Due Date | Status |
|---|---|---|---|
| Review all UI disclaimers | Product + Legal | 2026-12-17 | ⏳ Pending |
| Audit marketing copy | Marketing + Legal | 2026-12-17 | ⏳ Pending |
| Verify email templates | Engineering | 2026-11-24 | ⏳ Pending |
| Review ToS and privacy policy | Legal | 2026-12-31 | ⏳ Pending |
| Update API documentation | Engineering | 2026-11-24 | ⏳ Pending |

---

## Sign-off

| Role | Name | Date | Status |
|---|---|---|---|
| Legal counsel | — | TBD | ⏳ Pending |
| Product lead | — | TBD | ⏳ Pending |
| Engineering lead | — | TBD | ⏳ Pending |
| Marketing lead | — | TBD | ⏳ Pending |

**Next review due:** 2027-02-17 (quarterly)

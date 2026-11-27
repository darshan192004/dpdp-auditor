# Evidence-backed DPDPA readiness assessment design

**Date:** 2026-11-26
**Status:** Written spec for user review; design direction already approved in brainstorming
**Scope:** Full Phase A–F program, delivered as phase-gated PRs; readiness-only, source/config/IaC evidence for public GitHub repositories
**Supersedes:** The draft “DPDPA Auditor: Evidence-Backed Compliance Assessment Spec” wherever this document resolves a conflict in that draft
**Related documents:** `docs/memory.md`, `docs/rules.md`, `docs/architecture.md`, `docs/database.md`, `docs/security.md`, `packages/rule-packs/`, `packages/contracts/`

## Context

The current scoring engine gives full credit to an applicable control with zero findings. In `apps/orchestrator/src/modules/scoring/scoring.engine.ts`, every applicable control adds its weight to the denominator and is subtracted only when an active finding matches it. A control with no finding therefore scores as if a safeguard were proven. This is the concrete cause of the WebGoat false positive: a real hardcoded-key finding was present, yet the scan still scored `90/A`.

A deliberate fidelity probe confirmed that findings are real scanner output, not fabricated evidence. The problem is therefore semantic, not a broken scanner: “no configured rule fired” is being presented as “compliant”. The product must instead say what the code evidences, what it cannot determine, and what a human must verify.

The user supplied a detailed draft spec to fix this. I reviewed it against the monorepo, the official MeitY gazette, and the current code. The user then approved four decisions in brainstorming:

1. **Product position:** readiness only; no compliance verdict, certificate, or badge.
2. **Program scope:** full A–F, not a single Phase A slice.
3. **Execution shape:** phase-gated stack, A → F in dependency order.
4. **All design sections:** architecture/scope, verdict/scoring model, rule-pack/analyzer design, and UI/report/phase plan.

The DPDP Rules 2025 commencement dates in the draft were checked against the official gazette: Rules 1, 2 and 17–21 from 13 Nov 2025; Rule 4 from 13 Nov 2026; Rules 3, 5–16, 22 and 23 from 13 May 2027. The 10 Dec 2025 corrigendum G.S.R. 892(E) must also be referenced in the legal baseline. This design is not legal advice; counsel review remains a release gate.

## Product position

The product produces a **DPDPA readiness assessment**. It never says that an organisation is compliant, non-compliant, certified, or in violation of the Act. It never issues a compliance badge. Every score is displayed beside evidence coverage, open gaps, and a count of controls that could not be determined.

Approved language: “evidence of a gap”, “evidence of a safeguard”, “could not determine from code”, “readiness”, “confirm”, “self-declared”, and “not assessed by code”. Forbidden outside quoted disclaimers: “compliant”, “non-compliant”, “violation of the Act”, and “certified”. A CI language lint enforces this across UI strings, reports, exports, and rule messages.

## Decisions

1. The canonical verdicts are `PASS`, `FAIL`, `PARTIAL`, `UNKNOWN`, `NOT_APPLICABLE`, `MANUAL`, `ATTESTED_PASS`, and `ATTESTED_FAIL`.
2. Finding `kind` is a separate field with values `violation`, `missing_control`, `weak_control`, `positive`, and `unverified`.
3. PASS requires recorded positive evidence; FAIL requires cited gap evidence; UNKNOWN is excluded from the score and never becomes a pass.
4. A clean scanner run is methodology evidence only. It does not by itself create PASS.
5. If a detector required to determine a control failed, timed out, or was skipped, that control becomes `UNKNOWN` with reason `detector_unavailable`; a previous PASS is never reused. A direct or corroborated finding from a completed detector still yields `FAIL`, because missing evidence cannot erase cited evidence.
6. Confidence affects credit: `direct` counts fully; `inferred` and `advisory` count at half credit unless a second independent detector corroborates the same control.
7. Attestations are self-declared, carry half weight, expire, and never enter the evidence-coverage numerator.
8. Scanner coverage and evidence coverage are separate fields with separate names.
9. Legacy scans keep `scoring-1.x` and are visibly labelled “legacy scoring: no evidence was treated as pass”.
10. New scans use `scoring-2.0.0`, `inventory-1.0.0`, and a new rule pack `dpdpa-2026.11.0`.
11. Full A–F is delivered as phase-gated PRs. No push, deploy, image pin update, or PR merge happens without explicit user approval.

## Goals

- Stop `no finding = pass` for every applicable control.
- Produce specific, evidence-backed readiness gaps with file/line or documented search provenance.
- Show what could not be determined and how to enable evidence for it.
- Detect what personal data and privacy mechanisms a repository appears to handle, using facts and signals only.
- Preserve zero source-code retention, tenant isolation, HMAC callbacks, idempotency, and deterministic scoring.
- Keep historical scores and reports stable while adding a versioned v2 path.
- Provide developer-ready fixes, SARIF export, and issue-ready Markdown without opening issues or PRs on a target repository.

## Non-goals

- No legal opinion, compliance certificate, compliance badge, or “DPDP compliant” claim.
- No runtime verification of deployed sites in A–F. Phase G live verification is deferred until a separate threat-model review is signed off.
- No GitHub App, repository write scope, private repository scanning, credentialed clone, or arbitrary host fetching.
- No source code, file contents, secret values, or raw scanner output persisted in PostgreSQL, Redis, object storage, logs, or traces.
- No automatic merging of PR #103 or any other PR as part of this program.
- No k3s push or deployment until explicitly approved.

## Architecture

```text
clone (ephemeral pod)
  ├─ Semgrep ──────────────┐
  ├─ Checkov ──────────────┤
  ├─ Gitleaks ─────────────┼─► normalized findings ─► mapping ─┐
  └─ dpdp-inventory ───────┴─► sanitized facts/signals ─────────┤
                                                               ▼
                                                    ControlEvaluator (pure)
                                                               ▼
                                                    control_results + scoring v2
                                                               ▼
                                                    UI / PDF / SARIF / Markdown
```

- `apps/scan-runner` gains `dpdp_inventory/`, which runs in the same ephemeral Job or local container as the existing scanners. It reports only facts, signals, evidence references, detector status, and short allowlisted tokens. It never sends file contents or matched values.
- `packages/contracts` gains v2 schemas for inventory facts, control definitions, finding `kind`, verdicts, detector status, and attestations. Existing v1 schemas remain valid for legacy scans.
- `apps/orchestrator` gains a pure `ControlEvaluator` between mapping and scoring. It persists `control_results` and drives a version-dispatched scoring function. The orchestrator remains the only PostgreSQL writer.
- `apps/web` stays a thin Nuxt/Nitro proxy. It adds assessment, inventory, gaps, fix-plan, attestation, and export routes plus readiness-only UI views.
- `apps/renderer` renders the v2 report view model when the scan uses scoring v2; v1 reports keep their current template path.
- `packages/rule-packs` becomes a signed catalogue of controls, detectors, mappings, absence/positive rules, remediation, templates, and legal reference data.
- Invariants from `docs/memory.md` remain binding: Nitro is the only public HTTP surface, no `$queryRawUnsafe`, no `v-html` with user/scanner/API content, org-scoped tenant queries, digest-pinned scanner images, append-only audit logs, and anonymous URL-only GitHub access.

## Verdict model

### Canonical states

| Verdict | Meaning | Score treatment |
|---|---|---|
| `PASS` | Positive evidence of a required mechanism or safeguard exists | Full credit |
| `FAIL` | Cited evidence of a gap exists | No credit |
| `PARTIAL` | Mechanism is incomplete, delegated or weak, or evidence is a single inferred/advisory signal | `partialCredit`, default 0.5, × confidence multiplier |
| `UNKNOWN` | Applicable, but evidence is insufficient or a detector failed | Excluded; shown prominently |
| `NOT_APPLICABLE` | `appliesWhen` is false for the repo facts | Excluded |
| `MANUAL` | Cannot be code-verified | Excluded; shown as a checklist item |
| `ATTESTED_PASS` | Self-declared answer in a valid attestation | Half credit; excluded from evidence coverage |
| `ATTESTED_FAIL` | Self-declared negative answer | No credit; excluded from evidence coverage |

### Finding kinds

- `violation` — a pattern contradicting a safeguard.
- `missing_control` — a required mechanism absent where the repo demonstrably needs it, with search provenance.
- `weak_control` — a mechanism present but deficient.
- `positive` — evidence of a safeguard; shown under “what was found working”, excluded from gap counts.
- `unverified` — informational item requiring human review.

### Evaluation order

1. If the facts needed for `appliesWhen` are unavailable because a detector failed, return `UNKNOWN` with reason `applicability_unavailable`. Otherwise, if `appliesWhen` is false, return `NOT_APPLICABLE`.
2. If determinable code evidence exists, it wins over any attestation. A valid, unexpired attestation is used only when no determinable evidence exists; an expired or invalid attestation is ignored.
3. If `evidenceMode: manual-only`, return `MANUAL` or the valid attested variant.
4. If active mapped violation/weak-control findings exist: `violation` with `direct` or corroborated confidence returns `FAIL`; `violation` with single `inferred`/`advisory` confidence and any `weak_control` return `PARTIAL`.
5. If guarded absence rules trigger and required detectors completed, return `FAIL` with `kind: missing_control`.
6. If positive rules are fully satisfied by direct or corroborated evidence, return `PASS`; if only partial, delegated, or single-inferred evidence exists, return `PARTIAL`.
7. Otherwise return `UNKNOWN`.

A required detector failure short-circuits to `UNKNOWN` with `reason_code = detector_unavailable` and a coverage banner naming the detector, unless the control already has direct or corroborated finding evidence from a completed detector or a valid attestation supplies the self-declared answer. An attestation never becomes code evidence, never raises evidence coverage, and never lifts a grade above the coverage cap. Absence rules fire only when the repo demonstrably needs the mechanism. A library with no users does not fail “no consent table”; a web app with PII forms and no privacy artefact can fail after the searched paths are recorded.

### Confidence

Define `confidenceMultiplier`: `direct` = 1; `inferred` or `advisory` = 0.5; two independent detectors corroborating the same control = 1. This multiplier applies to `PARTIAL` credit. A `PASS` is only emitted for direct or corroborated positive evidence, so its credit is always 1; single inferred/advisory positive evidence is emitted as `PARTIAL`. A single inferred/advisory violation is also `PARTIAL`, never `FAIL`. Only corroborated/direct critical FAILs cap the grade at D.

## Scoring v2

For each applicable control with weight `w`:

```text
credit(PASS)          = 1
credit(PARTIAL)       = partialCredit (default 0.5) × confidenceMultiplier
credit(FAIL)          = 0
credit(ATTESTED_PASS) = 1 × 0.5 effective weight
credit(ATTESTED_FAIL) = 0 × 0.5 effective weight
```

```text
determinableWeight = Σw for PASS, FAIL, PARTIAL
attestedWeight     = 0.5 × Σw for ATTESTED_PASS, ATTESTED_FAIL
scoreWeight        = determinableWeight + attestedWeight

sectionScore = null if scoreWeight == 0
             = 100 × (Σ credit×effectiveWeight) / scoreWeight

evidenceCoverage = Σw(determinable) / Σw(applicable excluding MANUAL AND NOT_APPLICABLE)
                 = null when the denominator is 0
```

Overall score is the weighted average of assessed sections, normalising section weights over assessed sections only. Evidence coverage is the weighted average of section evidence coverage over assessed sections. If no section is assessed, both are `null`. Sections with no determinable or attested weight are not assessed and remain visible as “not assessed by code”.

Grade order:

1. Scanner coverage partial → withhold grade; score is provisional.
2. Evidence coverage below 0.50 → “Insufficient evidence”; no letter.
3. Evidence coverage 0.50–0.74 → letter capped at C.
4. Evidence coverage ≥ 0.75 → normal letter using the existing grade thresholds from `scoring-1.x`, unchanged.
5. Corroborated/direct critical FAIL → letter capped at D.

## Data model

- Add `control_results` with `org_id`, `scan_id`, `control_id`, `verdict`, `reason_code`, `evidence_json`, `rule_pack_version`, `scoring_version`, `created_at`, `updated_at`, and a unique key on `(scan_id, control_id)`. Enable RLS and index by `(scan_id, verdict)` and `(org_id, control_id)`.
- Add `kind` and `detector` to `scanner_findings`; add confidence provenance where it is not already derivable from the rule pack.
- Reuse `scans.facts` for inventory v1 facts. Add `inventory_version`, `inventory_status`, and `evidence_coverage` columns. A separate `scan_inventory` table is deferred until size or query requirements justify it.
- Add `attestations` with org/repo scope, questionnaire key, answer, note, `attested_by`, `attested_at`, `expires_at`, and audit attribution. Map attestation keys to controls in the rule pack so the table is not hard-coded to control IDs.
- Recompute `control_results` on scan completion, finding triage, attestation change, and detector-status change. Upserts must be idempotent and deterministic.
- Apply the existing 90-day scan/finding retention to `control_results`, inventory facts, and findings. Audit events for attestations follow the one-year audit retention.

## Rule pack v2

Introduce `dpdpa-2026.11.0` with checksummed files:

- `controls.yaml` — control ID, section, `actRef`, `ruleRef`, `severity`, `weight`, `evidenceMode`, `appliesWhen`, `violationRules`, `absenceRules`, `positiveRules`, `partialCredit`, remediation, and legal references.
- `mappings/*.yaml` — scanner and inventory detector IDs to controls with confidence, rationale, and fix template.
- `detectors.yaml` — every detector’s inputs, outputs, timeout, stacks, confidence, failure mode, and control refs.
- `commencement.yaml`, `penalties.yaml`, `india-regions.yaml`, `sdk_catalog.yaml`, `field_dictionary.yaml`, `mechanism_catalog.yaml`, `cmp_catalog.yaml`, `cookie_catalog.yaml`, `security_headers.yaml`, and `ecosystem_patterns/*.yaml`.
- `templates/` — privacy notice, breach runbook, DSR SOP, retention schedule, and processor list templates.
- `manifest.yaml` — SHA-256 checksums over every file, verified at pack load time in CI and at runtime. Cryptographic signature/key management is a later hardening item and is not required for A–F.

CI validation fails on duplicate control IDs, orphan detector IDs, a non-manual control without violation/absence/positive rules, missing legal refs, invalid commencement data, or a manifest checksum mismatch. v2 control IDs follow the existing convention `DPDPA-<section>-<KIND>-<NN>`; draft-style IDs such as `DP-6-01` are not valid. Control numbering follows the Act: 8(4) technical/organisational measures, 8(5) reasonable security safeguards, 8(6) breach intimation, 8(7) erasure, 8(9) published contact, 8(10) grievance mechanism, and s.13 right to grievance redressal. Legacy control codes remain readable for historical scans.

Remediation is structured: summary, why it matters, steps, code example, verification, effort, owner, references, and optional framework snippets. Every FAIL-capable control gets at least one concrete snippet.

## Inventory analyzer

The analyzer runs after clone, before completion, inside the same time-boxed pod.

First content phase: `schema_scan`, `form_scan`, `mechanism_scan`, `artefact_scan`, and the basic field dictionary. These directly support consent, notice, deletion, log redaction, and audit-log controls.

Second content phase: `dep_scan`, `sdk_init_scan`, `region_scan`, `pii_literal_scan`, `cookie_scan`, `cmp_scan`, `header_scan`, and `cms_scan`, plus the CMP/cookie/header/ecosystem catalogues and web-surface controls.

Safety rules:

- No network, no code execution, no eval of repository content, no YAML unsafe load.
- Ignore dependencies, vendored code, build output, binaries, and files above 1 MB.
- Use bounded regex or ReDoS-safe matching with timeouts.
- Emit field/column names, paths, line numbers, detector IDs, counts, and allowlisted tokens only. Values are discarded in memory.
- Cap every array and string length in the contract; validate before callback.
- Emit detector status for each module; a failed module never produces PASS.

Custom Semgrep rules and Checkov policies are added under the same detector catalogue with pinned versions and positive/negative fixtures. OSV/Trivy/Syft additions remain optional and are not required for A–F exit.

## API, UI, and exports

New read routes extend scan detail with an `assessment` object using explicit field names: `score`, `evidenceCoverage`, `openGaps`, `verdictCounts`, `unknownControls`, `detectorStatuses`, and `consentGatingRatio`. `scannerCoverageStatus` stays separate from `evidenceCoverage`; `consentGatingRatio` means the fraction of detected personal-data collection surfaces with a recorded consent gate, always shown beside the unknown count. Read-only routes cover inventory, gaps, fix plan, and exports. Attestation write routes are org-scoped, restricted to owner/admin, audited, and expiry-aware.

Scan detail shows four headline tiles: Score, Evidence coverage, Open gaps, and Consent-gating ratio for web repositories. Unknown counts appear beside the ratio. Section cards show PASS/FAIL/PARTIAL/UNKNOWN counts. A “Could not determine” panel explains how to add evidence. Legacy scans show the legacy-scoring badge. New pages cover Data Inventory, Compliance Gaps, Fix Plan, Attestations, and Exports. Rules explains each control’s detectors and absence semantics.

Exports generate SARIF 2.1.0 and issue-ready Markdown from `control_results`. The app never opens GitHub issues or PRs on the target repository.

## Report v2

New reports use a v2 view model selected by `scoringVersion`. Sections: executive readiness summary with score/coverage/gaps and commencement table; gaps grouped by section; evidence of safeguards; could-not-determine; data inventory summary; fix plan; methodology with detector versions and search provenance; limitations; disclaimer. Old reports keep the v1 view model.

## Phase plan

| PR | Scope | Exit gate |
|---|---|---|
| **0** | Reconciled spec, legal baseline, detector/fixture skeleton | Spec reviewed and approved; no runtime change |
| **A** | Verdict enum, `control_results`, evaluator, scoring v2, coverage tiles, legacy label | `fx-silent-app` shows insufficient evidence and no letter; WebGoat re-scan shows the hardcoded-key control as a gap with no A grade; legacy scores unchanged |
| **B** | v2 contracts, pack schema/catalogues, migrations, validators, version bump | Pack validation rejects orphan/missing rules; v1 still loads |
| **C** | Inventory MVP, callback/persistence, first control set | `fx-good-app`, `fx-bad-app`, `fx-silent-app` golden verdicts pass |
| **D** | Remaining controls, custom Semgrep/Checkov, templates, web-surface controls, consent-gating ratio | ≥45 controls; CMP/GTM/header fixtures pass |
| **E** | Attestations, new UI pages, report v2, SARIF/Markdown exports, language lint | Playwright walkthrough and PDF verified |
| **F** | Full fixtures, canary/determinism/performance, detector-error budgets, legal review record, beta | All Definition of Done items in the draft spec pass except Phase G |

Each PR runs `pnpm lint`, `pnpm typecheck`, `pnpm test`, Python tests for analyzer modules, and a visible Playwright MCP check for user-visible slices. Each PR is reviewed before merge; no deploy follows automatically.

## Verification gates

- Full monorepo gates remain green at every PR.
- Golden fixtures are committed/generated and never rely on network availability. Fixtures are test inputs only and must never be presented as pilot evidence or sign-off data. WebGoat and a small Juice-Shop-like repo are manual smoke tests, not CI gates.
- Every fixture runs twice with byte-identical `control_results`.
- Every finding and inventory signal maps to a control or to an explicit `unmapped` reason; v2 scans keep the existing `0 unmapped` gate.
- A canary string injected into fixture source must never appear in DB, object storage, logs, callbacks, or API responses.
- Inventory analyzer must finish within 120 seconds on a 100 MB repo; total scan remains inside the existing 900-second deadline.
- Detector error budget: any detector crash or timeout becomes `UNKNOWN` for dependent controls and a named coverage banner.
- Legal reviewer, review date, and re-verified official URLs are recorded in the rule-pack changelog before release.
- External pentest for non-internal exposure remains `Pending — deferred for internal pilot`.

## Risks and mitigations

- **False positives from heuristics:** confidence labels, corroboration requirements, path exclusions, and a beta false-positive target of ≤10% on direct-confidence controls before default display.
- **Legal drift:** commencement and penalty data are versioned files with official source URLs and a mandatory review gate.
- **Scope explosion:** phase-gated PRs and the ≥45-control target prevent a single unreviewable content dump.
- **Legacy migration:** version dispatch and visible legacy labels stop old scans from being silently rewritten.
- **Detector failure masquerading as clean:** detector status is persisted; missing status blocks PASS and gives `UNKNOWN`, while direct/corroborated cited findings still yield `FAIL`.
- **Real-repo test flakiness:** fixtures are CI gates; live public repos are manual smoke tests.
- **Branch/base conflict:** PR #103 is open and unmerged. This design is on a separate local branch based on `origin/main`; the implementation base will be chosen explicitly before Phase A.

## Open items before Phase A

1. Decide whether PR #103 is merged first or Phase A branches from the current pilot branch.
2. Name the legal reviewer and schedule review of control wording, penalties, commencement, and report language.
3. Choose the 5–10 beta repositories for the Phase F false-positive review.
4. Keep all pushes, PR creation, merges, image pin updates, and k3s deployments behind explicit user approval.

## References

- MeitY, Digital Personal Data Protection Act 2023, Act 22 of 2023, 11 Aug 2023: https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
- MeitY, Digital Personal Data Protection Rules 2025, G.S.R. 846(E), 13 Nov 2025: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
- MeitY, Corrigendum to DPDP Rules 2025, G.S.R. 892(E), 10 Dec 2025: https://www.meity.gov.in/static/uploads/2025/12/3c7ebbae0e5456f493f486e6845df86b.pdf
- Internal: `docs/memory.md`, `docs/rules.md`, `docs/architecture.md`, `docs/database.md`, `docs/security.md`, `docs/PRD.md`.

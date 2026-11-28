# Evidence-backed DPDPA readiness Phase F Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the A–F readiness program with a full canary-marked fixture corpus, byte-identical deterministic scoring, canary containment, inventory/scan performance budgets, detector-error budgets, a legal review record, and a beta false-positive gate that blocks default display until an approved 5–10 repository review meets the ≤10% target — without any pilot sign-off claim.

**Architecture:** Phase F is a verification-and-evidence phase on top of Phases C, D and E. It adds four small pure modules (a canonical control-result serializer, a redacted-sink serializer, named coverage banners, and a beta gate), records the legal and beta evidence in the rule pack and `docs/records/`, and wires the budgets into the scan runner. All assertions run offline against committed fixtures; WebGoat, Juice-Shop-like repositories, live APIs, and pilot repositories stay behind an explicit-approval manual gate.

**Tech Stack:** TypeScript, Vitest, Zod contracts, Node test runner (`node:test`), Python 3.12, pytest, ruff, mypy, Prisma/PostgreSQL, Nuxt 4.6.4 + Vue 3.5.45, `@dpdpa/contracts`, `@dpdpa/orchestrator`, `@dpdpa/web`, `@dpdpa/rule-packs`.

**Spec:** `docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md` (parent spec; Phase F row at lines 215–225 and verification gates at lines 229–239)  
**Related spec:** `docs/superpowers/specs/2026-11-27-dpdp-readiness-phase-b-design.md`  
**Predecessor plan:** `docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-b.md`  
**ADR:** `docs/decisions/0001-evidence-backed-dpdp-readiness.md`

## Global Constraints

- Readiness only. No compliance verdict, certificate, badge, or legal conclusion.
- Forbidden wording outside quoted disclaimers: 'compliant', 'non-compliant', 'violation of the Act', 'certified'. A CI language lint enforces this across UI strings, reports, exports, and rule messages.
- Never retain source code or file contents: no source code, file contents, secret values, or raw scanner output persisted in PostgreSQL, Redis, object storage, logs, or traces.
- Missing evidence never PASS. PASS requires recorded positive evidence; FAIL requires cited gap evidence; UNKNOWN is excluded from the score and never becomes a pass.
- Deterministic/versioned scoring: new scans use `scoring-2.0.0`, `inventory-1.0.0`, and `dpdpa-2026.11.0`; legacy scans keep `scoring-1.x` and are visibly labelled.
- UNKNOWN excluded from the score and shown prominently, beside a named coverage banner when a detector failed, timed out, or was skipped.
- Fixtures are test inputs only and never pilot evidence; WebGoat and a small Juice-Shop-like repo are manual smoke tests, not CI gates.
- No push/PR/merge/deploy without explicit approval. No push, deploy, image pin update, or PR merge happens without explicit user approval.
- Tests first: RED then GREEN at every task boundary. Record the exact RED failure before writing the implementation.
- Gates `pnpm lint && pnpm typecheck && pnpm test` before each commit. Do not commit unless all three are green.
- No manual WebGoat scan or live API without approval. No runtime verification of deployed sites in A–F; Phase G live verification is deferred until a separate threat-model review is signed off.
- Every fixture runs twice with byte-identical `control_results`; a canary string injected into fixture source must never appear in DB, object storage, logs, callbacks, or API responses.
- The inventory analyzer must finish within 120 seconds on a 100 MB repo; total scan remains inside the existing 900-second deadline.
- A detector crash or timeout becomes `UNKNOWN` for dependent controls and a named coverage banner; a direct/corroborated finding from a completed detector still yields `FAIL`.
- Legal reviewer, review date, and re-verified official URLs are recorded in the rule-pack changelog before release.
- Beta false-positive target is ≤10% on direct-confidence controls across 5–10 repositories before default display; no real pilot sign-off claim is made anywhere.

---

## Context for the engineer

This plan is the final phase of an approved A–F program. **It assumes Phases A, B, C, D and E have landed.** Phase A delivered the verdict enum, `control_results`, the pure evaluator, version-dispatched scoring v2, and the readiness UI. Phase B delivered v2 contracts, the `dpdpa-2026.11.0` pack foundation, validators, and additive migrations. Phase C adds `apps/scan-runner/src/scan_runner/dpdp_inventory/analyzer.py` with `analyze_repo(root: Path, *, deadline_s: int = 120) -> dict` (keys `inventoryVersion`, `facts`, `signals`, `detectorStatuses`) and the first golden verdicts. Phase D adds the remaining controls, custom Semgrep/Checkov rules, templates, and consent-gating ratio. Phase E adds attestations, new UI pages, report v2, SARIF/Markdown exports, and the language lint. If a command here fails with an import from `scan_runner.dpdp_inventory`, stop: Phase C is a prerequisite, not a Phase F defect.

Repository facts you must rely on:

- `apps/orchestrator/src/modules/scoring/control-evaluator.ts` exports `evaluateControls`, `buildDetectorStatuses`, `type ControlEvaluation`, `type DetectorStatus`, `type EvidenceLike`, and `type ControlResultLike`. `DetectorStatus = 'completed' | 'failed' | 'timed_out' | 'skipped'`. The evaluator already short-circuits to `UNKNOWN` with `reasonCode: 'detector_unavailable'` when a mapped detector is not `completed`, unless a direct/corroborated finding comes from a completed detector.
- `apps/orchestrator/src/modules/scoring/scoring.v2.ts` exports `scoreScanV2` and `type ScoreResultV2` with `evidenceCoverage`, `verdictCounts`, `unknownControls`, `openGaps`, `sections`, `gradeWithheldReason`.
- `loadRulePack(dir)` is in `apps/orchestrator/src/modules/rule-pack/rule-pack.loader.ts`; it loads the shipped v1 pack `dpdpa-2026.10.6` and ignores the sibling `v2/` directory. Offline Phase F helpers use it so fixtures need no v2 loader.
- `packages/contracts/src/golden-manifest.ts` exports `goldenManifestSchema` and `type GoldenManifest`; `CONTROL_CODE_PATTERN` is exported from `packages/contracts/src/fingerprint.ts` via `packages/contracts/src/index.ts`.
- `tests/golden-repos/` currently has 21 fixture directories. Only `fx-silent-app/src/silent.py` carries a canary marker (`CANARY_fx_silent_app_20261127_never_emit`); the other 20 need markers added in Task 1.
- `apps/scan-runner/src/scan_runner/batches.py` has `BatchClient` and `to_api_finding`; `apps/scan-runner/tests/test_callbacks.py` shows the `httpx.MockTransport` pattern used for callback containment tests.
- `apps/web/app/components/new/NewScanDetail.vue` already renders a `[role="status"]` detector-status banner with text such as `checkov failed` and `gitleaks timed_out`; Phase F verifies it end-to-end rather than rebuilding it.
- `apps/orchestrator/src/modules/reports/report-view-model.ts` exports `buildReportViewModel`, `type ReportSource`, `REPORT_DISCLAIMER`; v1 report view models stay byte-stable.

Commands used throughout:

- Orchestrator focused test: `pnpm --filter @dpdpa/orchestrator test -- <file>.test.ts`
- Web focused test: `pnpm --filter @dpdpa/web test -- <file>.test.ts`
- Contracts focused test: `pnpm --filter @dpdpa/contracts test -- <file>.test.ts`
- Rule packs: `pnpm --filter @dpdpa/rule-packs test`
- Runner Python tests: `cd apps/scan-runner && python -m pytest tests/<file>.py -v`
- Full gates: `pnpm lint && pnpm typecheck && pnpm test`
- Ledger (gitignored, local only): `.superpowers/sdd/2026-11-27-dpdp-evidence-backed-readiness-phase-f/progress.md`

Work from the Phase F branch chosen by the user, stacked after Phase E. Never force-add `.superpowers/`. Never push, open a PR, merge, deploy, change image pins, or touch `infra/`. Fixtures are test inputs only; never present them as pilot evidence or sign-off data.

---

## File Structure

- `apps/orchestrator/test/helpers/phase-f-fixture.ts` — shared offline fixture runner (fixture enumeration, manifest parsing, synthetic findings, canary extraction). Written in Task 1; reused by every later task.
- `apps/orchestrator/test/phase-f-fixtures.test.ts` — corpus, manifest, canary, and local-source assertions.
- `tests/golden-repos/**/src/*` — fixture-only source stand-ins carrying exactly one canary marker each. Test inputs only.
- `apps/orchestrator/src/modules/scoring/control-results-canonical.ts` — deterministic canonical serializer for `control_results`.
- `apps/orchestrator/test/phase-f-determinism.test.ts` — twice-per-fixture byte-identical checks.
- `apps/orchestrator/src/modules/scoring/redacted-sinks.ts` — allowlisted serializers for DB, object storage, logs, callbacks, and API outputs.
- `apps/orchestrator/test/phase-f-canary-containment.test.ts` — offline canary containment across all five sinks plus CI/live-smoke separation.
- `apps/scan-runner/src/scan_runner/budgets.py` — `INVENTORY_BUDGET_SECONDS = 120`, `SCAN_DEADLINE_SECONDS = 900`, and `enforce_inventory_budget`.
- `apps/scan-runner/src/scan_runner/batches.py` — explicit callback field allowlist (`CALLBACK_FINDING_FIELDS`).
- `apps/scan-runner/src/scan_runner/cli.py` — passes `deadline_s=INVENTORY_BUDGET_SECONDS` to the Phase C analyzer.
- `apps/scan-runner/tests/test_inventory_performance.py` — synthetic 100 MB repo budget test.
- `apps/scan-runner/tests/test_canary_containment.py` — runner callback containment test.
- `apps/orchestrator/src/modules/scoring/coverage-banners.ts` — pure named coverage banners for failed/timed-out/skipped detectors.
- `apps/orchestrator/src/modules/reports/report-view-model.ts` — adds `coverageBanners` to the report view model.
- `apps/orchestrator/test/phase-f-detector-budget.test.ts` — detector crash/timeout and direct-evidence-still-FAIL assertions.
- `apps/web/test/phase-f-detector-banner.test.ts` — UI banner names the detector next to the unknown count.
- `packages/rule-packs/v2/CHANGELOG.md` — legal review record with reviewer, date, and re-verified official URLs.
- `apps/orchestrator/test/phase-f-legal-review.test.ts` — changelog record assertions.
- `apps/orchestrator/src/modules/scoring/beta-gate.ts` — pure beta false-positive gate.
- `docs/records/phase-f-beta-false-positive-review.json` / `.md` — machine-readable gate input and human-readable approval record.
- `apps/orchestrator/test/phase-f-beta-gate.test.ts` — default-display gate tests with synthetic test inputs.
- `docs/records/phase-f-manual-smoke-gate.md` — approval-gated WebGoat/Juice-Shop/live-API checklist; never executed by CI.
- `docs/records/phase-f-readiness-status.md` — explicit no-pilot-sign-off and no-Phase-G statement.
- `apps/orchestrator/test/phase-f-exit-gate.test.ts` — all Definition of Done items except Phase G.
- This plan file.

---

### Task 1: Full golden fixture corpus with canary markers (test inputs only)

**Files:**
- Create: `apps/orchestrator/test/helpers/phase-f-fixture.ts`
- Create: `apps/orchestrator/test/phase-f-fixtures.test.ts`
- Create: `tests/golden-repos/accepted-risk/src/accepted_risk.py`, `tests/golden-repos/leaked-aws-key/src/leaked_aws_key.py`, `tests/golden-repos/missing-privacy-notice/src/missing_notice.py`, `tests/golden-repos/monorepo-mixed/src/mixed.py`, `tests/golden-repos/overpermissive-security-group/src/security_group.tf`, `tests/golden-repos/public-bucket/src/bucket.tf`, `tests/golden-repos/unencrypted-s3/src/s3.tf`, `tests/golden-repos/unmapped-rule/src/unmapped.py`
- Modify: `tests/golden-repos/false-positive/app.py`, `tests/golden-repos/hardcoded-credentials/config.py`, `tests/golden-repos/insecure-cookies/app.js`, `tests/golden-repos/insecure-deserialization/app.py`, `tests/golden-repos/missing-audit-logging/app.py`, `tests/golden-repos/missing-csp-headers/app.py`, `tests/golden-repos/missing-encryption-at-rest/main.tf`, `tests/golden-repos/missing-rate-limits/app.py`, `tests/golden-repos/no-findings/app.py`, `tests/golden-repos/plaintext-pii-logs/app.py`, `tests/golden-repos/scanner-timeout/app.py`, `tests/golden-repos/weak-auth-session/app.js`

**Interfaces:**
- Consumes: `goldenManifestSchema` / `type GoldenManifest` from `@dpdpa/contracts`; `CONTROL_CODE_PATTERN` from `@dpdpa/contracts`; `loadRulePack(dir: string)` from `../src/modules/rule-pack/rule-pack.loader.js`; `buildDetectorStatuses(coverage: Readonly<Record<string, string>>)`, `evaluateControls(input: ControlEvaluatorInput)`, `type ControlEvaluation`, `type EvidenceLike` from `../src/modules/scoring/control-evaluator.js`; `scoreScanV2(input: ScoreInputV2)`, `type ScoreResultV2` from `../src/modules/scoring/scoring.v2.js`.
- Produces: `fixtureDirs(): string[]`, `canaryMarker(dir: string): string`, `readSources(dir: string): string[]`, `loadManifest(dir: string): GoldenManifest`, `syntheticFindings(dir: string, manifest: GoldenManifest): EvidenceLike[]`, `runFixture(dir: string): Promise<FixtureRun>`, and `interface FixtureRun { dir: string; name: string; manifest: GoldenManifest; findings: EvidenceLike[]; detectorStatuses: Record<string, DetectorStatus>; evaluation: ControlEvaluation; scored: ScoreResultV2 }`. Every later task imports these names from `./helpers/phase-f-fixture.js`.

- [x] **Step 1: Write the failing test and the shared fixture helper**

```ts
// apps/orchestrator/test/helpers/phase-f-fixture.ts
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { goldenManifestSchema, type GoldenManifest } from '@dpdpa/contracts';
import { parse } from 'yaml';
import { loadRulePack } from '../../src/modules/rule-pack/rule-pack.loader.js';
import {
  buildDetectorStatuses,
  evaluateControls,
  type ControlEvaluation,
  type DetectorStatus,
  type EvidenceLike,
} from '../../src/modules/scoring/control-evaluator.js';
import { scoreScanV2, type ScoreResultV2 } from '../../src/modules/scoring/scoring.v2.js';

export const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
export const PACK_DIR = join(ROOT, 'packages/rule-packs');
export const FIXTURE_ROOT = join(ROOT, 'tests/golden-repos');
export const CANARY_PATTERN = /CANARY_[A-Za-z0-9_]+/g;

export interface FixtureRun {
  dir: string;
  name: string;
  manifest: GoldenManifest;
  findings: EvidenceLike[];
  detectorStatuses: Record<string, DetectorStatus>;
  evaluation: ControlEvaluation;
  scored: ScoreResultV2;
}

export function fixtureDirs(): string[] {
  return readdirSync(FIXTURE_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'node_modules')
    .map((entry) => join(FIXTURE_ROOT, entry.name))
    .sort();
}

export function readSources(dir: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name !== 'manifest.yaml' && !entry.name.startsWith('README')) {
        files.push(path);
      }
    }
  };
  walk(dir);
  return files.sort();
}

export function canaryMarker(dir: string): string {
  const markers = new Set<string>();
  for (const file of readSources(dir)) {
    for (const match of readFileSync(file, 'utf8').matchAll(CANARY_PATTERN)) markers.add(match[0]);
  }
  if (markers.size !== 1) {
    throw new Error(`${basename(dir)}: expected one distinct canary marker, got ${markers.size}`);
  }
  return [...markers][0]!;
}

export function loadManifest(dir: string): GoldenManifest {
  return goldenManifestSchema.parse(parse(readFileSync(join(dir, 'manifest.yaml'), 'utf8')));
}

export function syntheticFindings(dir: string, manifest: GoldenManifest): EvidenceLike[] {
  return manifest.expectedFindings.map((expected) => ({
    controlCode: expected.control ?? null,
    kind: 'violation' as const,
    scanner: expected.scanner as EvidenceLike['scanner'],
    scannerRuleId: expected.ruleId,
    evidenceHash:
      'sha256:' +
      createHash('sha256').update(`${basename(dir)}:${expected.ruleId}`).digest('hex'),
    filePath: `src/${basename(dir)}/fixture.ts`,
    lineStart: 1,
    lineEnd: 1,
    fingerprint: `fixture:${basename(dir)}:${expected.ruleId}`,
    severity: expected.severity,
    confidence: expected.confidence,
    status: 'open' as const,
  }));
}

export async function runFixture(dir: string): Promise<FixtureRun> {
  const manifest = loadManifest(dir);
  const pack = await loadRulePack(PACK_DIR);
  const coverage: Record<string, 'completed' | 'timed_out'> = Object.fromEntries(
    manifest.scanners.map((scanner) => [scanner, 'completed' as const]),
  );
  if (basename(dir) === 'scanner-timeout') coverage.gitleaks = 'timed_out';
  const detectorStatuses = buildDetectorStatuses(coverage);
  const findings = syntheticFindings(dir, manifest);
  const evaluation = evaluateControls({
    controls: pack.controls,
    facts: { languages: manifest.languages },
    mappings: pack.mappings,
    detectorStatuses,
    findings,
    rulePackVersion: pack.pack,
    scoringVersion: 'scoring-2.0.0',
  });
  const scored = scoreScanV2({
    findings,
    controls: pack.controls,
    facts: { languages: manifest.languages },
    coverage: manifest.expectedCoverage,
    results: evaluation.results,
  });
  return { dir, name: basename(dir), manifest, findings, detectorStatuses, evaluation, scored };
}
```

```ts
// apps/orchestrator/test/phase-f-fixtures.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CONTROL_CODE_PATTERN } from '@dpdpa/contracts';
import { canaryMarker, fixtureDirs, loadManifest, readSources } from './helpers/phase-f-fixture.js';

describe('Phase F golden fixture corpus (test inputs only)', () => {
  it('contains the full 21-fixture corpus with parseable manifests', () => {
    const dirs = fixtureDirs();
    expect(dirs).toHaveLength(21);
    for (const dir of dirs) expect(() => loadManifest(dir)).not.toThrow();
  });

  it('gives every fixture exactly one canary marker in source, never in its manifest', () => {
    for (const dir of fixtureDirs()) {
      const marker = canaryMarker(dir);
      const manifestText = readFileSync(join(dir, 'manifest.yaml'), 'utf8');
      expect(manifestText.includes(marker), `${dir}: manifest must not contain the canary`).toBe(
        false,
      );
    }
  });

  it('keeps fixture source local and free of live repository URLs', () => {
    for (const dir of fixtureDirs()) {
      for (const file of readSources(dir)) {
        expect(readFileSync(file, 'utf8'), `${file}: no live GitHub URL`).not.toMatch(
          /https?:\/\/github\.com\//,
        );
      }
    }
  });

  it('maps every expected finding to a control except the explicit unmapped fixture', () => {
    for (const dir of fixtureDirs()) {
      const manifest = loadManifest(dir);
      for (const finding of manifest.expectedFindings) {
        if (manifest.name === 'unmapped-rule') {
          expect(finding.control).toBeUndefined();
          expect(manifest.tolerances.extraFindings).toBeGreaterThan(0);
        } else {
          expect(finding.control, `${dir}: ${finding.ruleId} needs a control`).toMatch(
            CONTROL_CODE_PATTERN,
          );
        }
      }
    }
  });
});
```

- [x] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-fixtures.test.ts`  
Expected RED (excerpt):

```text
FAIL  apps/orchestrator/test/phase-f-fixtures.test.ts > Phase F golden fixture corpus (test inputs only) > gives every fixture exactly one canary marker in source, never in its manifest
Error: accepted-risk: expected one distinct canary marker, got 0
Test Files  1 failed (1)
Tests       1 failed | 3 passed (4)
```

Record the excerpt verbatim in `.superpowers/sdd/2026-11-27-dpdp-evidence-backed-readiness-phase-f/progress.md`.

- [x] **Step 3: Add canary-marked fixture sources (minimal GREEN implementation)**

```bash
cd /home/darshan.parmar/.local/share/opencode/worktree/f08747/k3s-internal-pilot
mkdir -p tests/golden-repos/accepted-risk/src tests/golden-repos/leaked-aws-key/src tests/golden-repos/missing-privacy-notice/src tests/golden-repos/monorepo-mixed/src tests/golden-repos/overpermissive-security-group/src tests/golden-repos/public-bucket/src tests/golden-repos/unencrypted-s3/src tests/golden-repos/unmapped-rule/src
cat > tests/golden-repos/accepted-risk/src/accepted_risk.py <<'EOF'
"""Fixture-only source stand-in. Not pilot evidence."""

# CANARY_accepted_risk_20261127_never_emit
RISK = "accepted"
EOF
cat > tests/golden-repos/leaked-aws-key/src/leaked_aws_key.py <<'EOF'
"""Fixture-only source stand-in. Not pilot evidence."""

# CANARY_leaked_aws_key_20261127_never_emit
KEY_NAME = "fixture_only"
EOF
cat > tests/golden-repos/missing-privacy-notice/src/missing_notice.py <<'EOF'
"""Fixture-only source stand-in. Not pilot evidence."""

# CANARY_missing_privacy_notice_20261127_never_emit
NOTICE_PRESENT = False
EOF
cat > tests/golden-repos/monorepo-mixed/src/mixed.py <<'EOF'
"""Fixture-only source stand-in. Not pilot evidence."""

# CANARY_monorepo_mixed_20261127_never_emit
PACKAGES = ["fixture-a", "fixture-b"]
EOF
cat > tests/golden-repos/overpermissive-security-group/src/security_group.tf <<'EOF'
# Fixture-only source stand-in. Not pilot evidence.
# CANARY_overpermissive_security_group_20261127_never_emit
resource "aws_security_group" "fixture" {
  name = "fixture-only"
}
EOF
cat > tests/golden-repos/public-bucket/src/bucket.tf <<'EOF'
# Fixture-only source stand-in. Not pilot evidence.
# CANARY_public_bucket_20261127_never_emit
resource "aws_s3_bucket" "fixture" {
  bucket = "fixture-only"
}
EOF
cat > tests/golden-repos/unencrypted-s3/src/s3.tf <<'EOF'
# Fixture-only source stand-in. Not pilot evidence.
# CANARY_unencrypted_s3_20261127_never_emit
resource "aws_s3_bucket" "fixture" {
  bucket = "fixture-only"
}
EOF
cat > tests/golden-repos/unmapped-rule/src/unmapped.py <<'EOF'
"""Fixture-only source stand-in. Not pilot evidence."""

# CANARY_unmapped_rule_20261127_never_emit
RULE = "java.lang.security.audit.crypto.weak-hash"
EOF
printf '\n# CANARY_false_positive_20261127_never_emit\n' >> tests/golden-repos/false-positive/app.py
printf '\n# CANARY_hardcoded_credentials_20261127_never_emit\n' >> tests/golden-repos/hardcoded-credentials/config.py
printf '\n// CANARY_insecure_cookies_20261127_never_emit\n' >> tests/golden-repos/insecure-cookies/app.js
printf '\n# CANARY_insecure_deserialization_20261127_never_emit\n' >> tests/golden-repos/insecure-deserialization/app.py
printf '\n# CANARY_missing_audit_logging_20261127_never_emit\n' >> tests/golden-repos/missing-audit-logging/app.py
printf '\n# CANARY_missing_csp_headers_20261127_never_emit\n' >> tests/golden-repos/missing-csp-headers/app.py
printf '\n# CANARY_missing_encryption_at_rest_20261127_never_emit\n' >> tests/golden-repos/missing-encryption-at-rest/main.tf
printf '\n# CANARY_missing_rate_limits_20261127_never_emit\n' >> tests/golden-repos/missing-rate-limits/app.py
printf '\n# CANARY_no_findings_20261127_never_emit\n' >> tests/golden-repos/no-findings/app.py
printf '\n# CANARY_plaintext_pii_logs_20261127_never_emit\n' >> tests/golden-repos/plaintext-pii-logs/app.py
printf '\n# CANARY_scanner_timeout_20261127_never_emit\n' >> tests/golden-repos/scanner-timeout/app.py
printf '\n// CANARY_weak_auth_session_20261127_never_emit\n' >> tests/golden-repos/weak-auth-session/app.js
```

- [x] **Step 4: Run the test to verify GREEN**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-fixtures.test.ts`  
Expected GREEN:

```text
✓ apps/orchestrator/test/phase-f-fixtures.test.ts (4 tests) 118ms
Test Files  1 passed (1)
Tests       4 passed (4)
```

- [x] **Step 5: Run full gates**

Run: `pnpm lint && pnpm typecheck && pnpm test`  
Expected: three commands exit 0; turbo reports `Tasks: 10 successful, 10 total`.

- [x] **Step 6: Commit**

```bash
git add apps/orchestrator/test/helpers/phase-f-fixture.ts apps/orchestrator/test/phase-f-fixtures.test.ts tests/golden-repos
git commit -m "test(phase-f): add canary-marked golden fixture corpus"
```

---

### Task 2: Canonical, byte-identical control results for every fixture

**Files:**
- Create: `apps/orchestrator/src/modules/scoring/control-results-canonical.ts`
- Create: `apps/orchestrator/test/phase-f-determinism.test.ts`

**Interfaces:**
- Consumes: `fixtureDirs(): string[]`, `runFixture(dir: string): Promise<FixtureRun>` from `./helpers/phase-f-fixture.js` (Task 1); `type ControlResultLike` from `../src/modules/scoring/control-evaluator.js`.
- Produces: `canonicalControlResultsBytes(results: readonly ControlResultLike[]): string` — a stable JSON serialization that sorts controls by `controlCode`, sorts evidence by its canonical JSON, and includes only the fields `controlCode`, `verdict`, `reasonCode`, `confidence`, `rulePackVersion`, `scoringVersion`, and `evidence` (each evidence entry has exactly `kind`, `scanner`, `scannerRuleId`, `evidenceHash`, `filePath`, `lineStart`, `lineEnd`, `fingerprint`). Tasks 3 and 8 import this name.

- [x] **Step 1: Write the failing test**

```ts
// apps/orchestrator/test/phase-f-determinism.test.ts
import { describe, expect, it } from 'vitest';
import { canonicalControlResultsBytes } from '../src/modules/scoring/control-results-canonical.js';
import { fixtureDirs, runFixture } from './helpers/phase-f-fixture.js';

describe('Phase F determinism', () => {
  it('runs every fixture twice with byte-identical canonical control_results', async () => {
    for (const dir of fixtureDirs()) {
      const first = canonicalControlResultsBytes((await runFixture(dir)).evaluation.results);
      const second = canonicalControlResultsBytes((await runFixture(dir)).evaluation.results);
      expect(second === first, `${dir}: control_results drifted`).toBe(true);
    }
  });

  it('keeps canonical control_results free of wall-clock times and generated UUIDs', async () => {
    const run = await runFixture(fixtureDirs()[0]!);
    const bytes = canonicalControlResultsBytes(run.evaluation.results);
    expect(bytes).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(bytes).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  });

  it('records versioned scoring on every result', async () => {
    for (const dir of fixtureDirs()) {
      const run = await runFixture(dir);
      for (const result of run.evaluation.results) {
        expect(result.rulePackVersion).toMatch(/^dpdpa-\d{4}\.\d{2}\.\d+$/);
        expect(result.scoringVersion).toBe('scoring-2.0.0');
      }
    }
  });
});
```

- [x] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-determinism.test.ts`  
Expected RED:

```text
Error: Failed to load url ../../src/modules/scoring/control-results-canonical.js
Test Files  1 failed (1)
Tests       0 failed | 0 passed (0)
```

Record the `Failed to load url` line in the progress ledger.

- [x] **Step 3: Write the minimal implementation**

```ts
// apps/orchestrator/src/modules/scoring/control-results-canonical.ts
import type { ControlResultLike } from './control-evaluator.js';

interface CanonicalEvidence {
  kind: string;
  scanner: string | null;
  scannerRuleId: string | null;
  evidenceHash: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  fingerprint: string | null;
}

interface CanonicalResult {
  controlCode: string;
  verdict: string;
  reasonCode: string;
  confidence: string | null;
  rulePackVersion: string;
  scoringVersion: string;
  evidence: CanonicalEvidence[];
}

/**
 * Byte-stable serialization of control_results for CI determinism gates.
 * Volatile fields (timestamps, generated UUIDs, raw source) are not part of
 * the contract and are therefore never serialized here.
 */
export function canonicalControlResultsBytes(results: readonly ControlResultLike[]): string {
  const canonical: CanonicalResult[] = results
    .map((result) => ({
      controlCode: result.controlCode,
      verdict: result.verdict,
      reasonCode: result.reasonCode,
      confidence: result.confidence,
      rulePackVersion: result.rulePackVersion,
      scoringVersion: result.scoringVersion,
      evidence: result.evidence
        .map((item): CanonicalEvidence => ({
          kind: item.kind,
          scanner: item.scanner ?? null,
          scannerRuleId: item.scannerRuleId ?? null,
          evidenceHash: item.evidenceHash ?? null,
          filePath: item.filePath ?? null,
          lineStart: item.lineStart ?? null,
          lineEnd: item.lineEnd ?? null,
          fingerprint: item.fingerprint ?? null,
        }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    }))
    .sort((a, b) => a.controlCode.localeCompare(b.controlCode));
  return JSON.stringify(canonical);
}
```

- [x] **Step 4: Run the test to verify GREEN**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-determinism.test.ts`  
Expected GREEN:

```text
✓ apps/orchestrator/test/phase-f-determinism.test.ts (3 tests) 96ms
Test Files  1 passed (1)
Tests       3 passed (3)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/orchestrator/src/modules/scoring/control-results-canonical.ts apps/orchestrator/test/phase-f-determinism.test.ts
git commit -m "feat(scoring): add canonical control_results determinism gate"
```

Expected gates: all three exit 0.

---

### Task 3: Canary containment across DB, object storage, logs, callbacks, and API

**Files:**
- Create: `apps/orchestrator/src/modules/scoring/redacted-sinks.ts`
- Create: `apps/orchestrator/test/phase-f-canary-containment.test.ts`
- Create: `docs/records/phase-f-manual-smoke-gate.md`
- Modify: `apps/scan-runner/src/scan_runner/batches.py`
- Create: `apps/scan-runner/tests/test_canary_containment.py`

**Interfaces:**
- Consumes: `canonicalControlResultsBytes` from `../src/modules/scoring/control-results-canonical.js` (Task 2); `canaryMarker`, `fixtureDirs`, `runFixture` from `./helpers/phase-f-fixture.js` (Task 1); `type ControlResultLike`, `type EvidenceLike` from `./control-evaluator.js`; `type ScoreResultV2` from `./scoring.v2.js`; `BatchClient` from `scan_runner.batches`; `Config` from `scan_runner.config`.
- Produces: `redactedSinks(input: RedactedSinkInput): RedactedSinks` with `RedactedSinkInput = { controlResults: readonly ControlResultLike[]; findings: readonly EvidenceLike[]; score: ScoreResultV2; verdictCounts: unknown; unknownControls: readonly string[]; detectorStatuses: unknown; evidenceCoverage: number | null }` and `RedactedSinks = { databaseRows: string; objectStorageReport: string; logLines: string; callbackBodies: string; apiResponses: string }`. Also produces `CALLBACK_FINDING_FIELDS: Final[tuple[str, ...]]` in `scan_runner.batches`. Task 8 consumes `redactedSinks`.

- [x] **Step 1: Write the failing TypeScript test**

```ts
// apps/orchestrator/test/phase-f-canary-containment.test.ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { redactedSinks } from '../src/modules/scoring/redacted-sinks.js';
import { canaryMarker, fixtureDirs, runFixture } from './helpers/phase-f-fixture.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Phase F canary containment (offline sinks)', () => {
  it('never emits a fixture canary into DB rows, reports, logs, callbacks, or API fields', async () => {
    for (const dir of fixtureDirs()) {
      const run = await runFixture(dir);
      const marker = canaryMarker(dir);
      const sinks = redactedSinks({
        controlResults: run.evaluation.results,
        findings: run.findings,
        score: run.scored,
        verdictCounts: run.scored.verdictCounts,
        unknownControls: run.scored.unknownControls,
        detectorStatuses: run.detectorStatuses,
        evidenceCoverage: run.scored.evidenceCoverage,
      });
      for (const [name, text] of Object.entries(sinks)) {
        expect(text.includes(marker), `${dir}: canary leaked into ${name}`).toBe(false);
      }
    }
  });

  it('keeps live WebGoat, Juice-Shop and API smoke steps out of CI', () => {
    const doc = readFileSync(join(root, 'docs/records/phase-f-manual-smoke-gate.md'), 'utf8');
    expect(doc).toContain('REQUIRES EXPLICIT APPROVAL');
    const workflowDir = join(root, '.github/workflows');
    for (const file of readdirSync(workflowDir)) {
      if (!file.endsWith('.yml') && !file.endsWith('.yaml')) continue;
      expect(readFileSync(join(workflowDir, file), 'utf8'), `${file}: no live smoke in CI`).not.toMatch(
        /webgoat|juice-shop/i,
      );
    }
  });
});
```

- [x] **Step 2: Write the failing Python test**

```python
# apps/scan-runner/tests/test_canary_containment.py
"""Fixture-only canary containment for signed finding callbacks."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import httpx
from pydantic import SecretStr

from scan_runner.batches import BatchClient, CALLBACK_FINDING_FIELDS
from scan_runner.config import Config

CANARY = "CANARY_PHASE_F_NEVER_EMIT"

CONFIG = Config(
    scan_id="scan-phase-f",
    orchestrator_url="http://orchestrator:3001",
    hmac_key=SecretStr("h" * 32),
    internal_key=SecretStr("i" * 32),
    org_id="org-1",
    repo_url="https://github.com/WebGoat/WebGoat.git",
    repo_ref="main",
    workspace="/workspace",
)


def test_callback_allowlist_never_carries_fixture_source_content() -> None:
    captured: list[bytes] = []

    def handler(request: httpx.Request) -> httpx.Response:
        captured.append(request.content)
        return httpx.Response(200, json={"data": {"accepted": 1, "duplicates": 0}})

    evidence = f'api_key = "{CANARY}"'
    finding: dict[str, Any] = {
        "scanner": "gitleaks",
        "rule_id": "generic-api-key",
        "severity": "high",
        "file": "src/fixture.py",
        "line": 3,
        "description": "Synthetic fixture finding.",
        "evidence": evidence,
        "fingerprint": "fpt_phase_f_canary",
        "snippet": CANARY,
        "value": CANARY,
        "content": CANARY,
        "raw": CANARY,
    }

    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        batch = BatchClient(CONFIG, scanner="gitleaks", scanner_version="8.21.0", client=client)
        batch.add(finding)
        batch.finish()

    body = captured[0].decode("utf-8")
    payload = json.loads(body)
    assert CANARY not in body
    assert payload["findings"][0]["evidenceHash"] == "sha256:" + hashlib.sha256(
        evidence.encode()
    ).hexdigest()
    assert CALLBACK_FINDING_FIELDS == (
        "scannerRuleId",
        "scannerRuleVersion",
        "severity",
        "filePath",
        "lineStart",
        "lineEnd",
        "message",
        "evidenceHash",
        "fingerprint",
        "context",
    )
    assert set(payload["findings"][0]) == set(CALLBACK_FINDING_FIELDS)
```

- [x] **Step 3: Run both tests to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-canary-containment.test.ts`  
Expected RED:

```text
Error: Failed to load url ../../src/modules/scoring/redacted-sinks.js
Test Files  1 failed (1)
```

Run: `cd apps/scan-runner && python -m pytest tests/test_canary_containment.py -v`  
Expected RED:

```text
ImportError while importing test module 'tests/test_canary_containment.py':
cannot import name 'CALLBACK_FINDING_FIELDS' from 'scan_runner.batches'
```

Record both excerpts in the progress ledger.

- [x] **Step 4: Write the minimal TypeScript implementation**

```ts
// apps/orchestrator/src/modules/scoring/redacted-sinks.ts
import type { ControlResultLike, EvidenceLike } from './control-evaluator.js';
import type { ScoreResultV2 } from './scoring.v2.js';

export interface RedactedSinkInput {
  controlResults: readonly ControlResultLike[];
  findings: readonly EvidenceLike[];
  score: ScoreResultV2;
  verdictCounts: unknown;
  unknownControls: readonly string[];
  detectorStatuses: unknown;
  evidenceCoverage: number | null;
}

export interface RedactedSinks {
  databaseRows: string;
  objectStorageReport: string;
  logLines: string;
  callbackBodies: string;
  apiResponses: string;
}

/**
 * Allowlisted representations of every persistence/transport surface. Source
 * content, matched values, and raw scanner output never enter these strings.
 */
export function redactedSinks(input: RedactedSinkInput): RedactedSinks {
  const evidence = input.findings.map((finding) => ({
    kind: finding.kind,
    scanner: finding.scanner ?? null,
    scannerRuleId: finding.scannerRuleId ?? null,
    evidenceHash: finding.evidenceHash ?? null,
    filePath: finding.filePath ?? null,
    lineStart: finding.lineStart ?? null,
    lineEnd: finding.lineEnd ?? null,
    fingerprint: finding.fingerprint ?? null,
    severity: finding.severity,
    confidence: finding.confidence,
  }));
  return {
    databaseRows: JSON.stringify(input.controlResults),
    objectStorageReport: JSON.stringify({
      score: input.score.score,
      grade: input.score.grade,
      sections: input.score.sections,
      findings: evidence,
    }),
    logLines: evidence
      .map((item) => `${item.fingerprint ?? 'no-fingerprint'} ${item.evidenceHash ?? 'no-hash'}`)
      .join('\n'),
    callbackBodies: JSON.stringify(evidence),
    apiResponses: JSON.stringify({
      score: input.score.score,
      evidenceCoverage: input.evidenceCoverage,
      verdictCounts: input.verdictCounts,
      unknownControls: input.unknownControls,
      detectorStatuses: input.detectorStatuses,
    }),
  };
}
```

- [x] **Step 5: Write the minimal Python implementation**

In `apps/scan-runner/src/scan_runner/batches.py`, change `from typing import Any` to `from typing import Any, Final` and add the constant after the import block, immediately before `class BatchClient:`:

```python
CALLBACK_FINDING_FIELDS: Final[tuple[str, ...]] = (
    "scannerRuleId",
    "scannerRuleVersion",
    "severity",
    "filePath",
    "lineStart",
    "lineEnd",
    "message",
    "evidenceHash",
    "fingerprint",
    "context",
)
```

Then replace the `return { ... }` at the end of `to_api_finding` with an explicitly filtered payload. The complete resulting function body after the existing `line` and `evidence` lines is:

```python
    payload: dict[str, Any] = {
        "scannerRuleId": str(finding.get("rule_id") or "unknown"),
        "scannerRuleVersion": scanner_version,
        "severity": str(finding.get("severity") or "medium").lower(),
        "filePath": str(finding.get("file") or ""),
        "lineStart": line,
        "lineEnd": line,
        "message": str(finding.get("description") or ""),
        "evidenceHash": "sha256:" + hashlib.sha256(evidence.encode()).hexdigest(),
        "fingerprint": str(finding.get("fingerprint") or ""),
        "context": {},
    }
    return {key: payload[key] for key in CALLBACK_FINDING_FIELDS}
```

- [x] **Step 6: Write the approval-gated manual smoke record**

```markdown
<!-- docs/records/phase-f-manual-smoke-gate.md -->
# Phase F manual smoke gate

REQUIRES EXPLICIT APPROVAL. This checklist is never executed by CI and is not a pilot sign-off.

Fixtures under `tests/golden-repos/` are test inputs only and must never be presented as pilot evidence or sign-off data. WebGoat and a small Juice-Shop-like repository are manual smoke tests, not CI gates.

## Before running

1. Obtain explicit user approval for a live public-repository scan and for each destination URL.
2. Use an ephemeral workspace under `/tmp/opencode/` and delete it after the run.
3. Never log, persist, or callback raw scanner output; the signed callback allowlist in `apps/scan-runner/src/scan_runner/batches.py` is the only transport shape.

## Approved-run commands (do not execute without step 1)

```sh
cd apps/scan-runner
python -m pip install -e '.[dev]'
SCAN_ID=phase-f-webgoat ORCHESTRATOR_URL=http://orchestrator:3001 \
CALLBACK_HMAC_KEY="$CALLBACK_HMAC_KEY" INTERNAL_KEY="$INTERNAL_KEY" \
ORG_ID=org-local REPO_URL=https://github.com/WebGoat/WebGoat.git REPO_REF=main \
WORKSPACE=/tmp/opencode/phase-f-webgoat run-scan
python -m pytest tests/test_canary_containment.py -v
```

After the run, record only counts, verdicts, detector statuses, and the absence of the canary in DB/object storage/logs/callbacks/API. Do not claim a pilot sign-off, a compliance verdict, or a certificate. Phase G live URL verification remains deferred pending a separate threat-model review.
```

- [x] **Step 7: Run both tests to verify GREEN**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-canary-containment.test.ts`  
Expected GREEN:

```text
✓ apps/orchestrator/test/phase-f-canary-containment.test.ts (2 tests) 102ms
Test Files  1 passed (1)
Tests       2 passed (2)
```

Run: `cd apps/scan-runner && python -m pytest tests/test_canary_containment.py -v`  
Expected GREEN:

```text
tests/test_canary_containment.py::test_callback_allowlist_never_carries_fixture_source_content PASSED
1 passed in 0.12s
```

- [x] **Step 8: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
cd apps/scan-runner && python -m pytest tests/test_canary_containment.py tests/test_callbacks.py -v && ruff check . && mypy src tests
cd ../..
git add apps/orchestrator/src/modules/scoring/redacted-sinks.ts apps/orchestrator/test/phase-f-canary-containment.test.ts docs/records/phase-f-manual-smoke-gate.md apps/scan-runner/src/scan_runner/batches.py apps/scan-runner/tests/test_canary_containment.py
git commit -m "test(phase-f): enforce canary containment across all sinks"
```

Expected: all gates exit 0; existing callback tests remain green.

---

### Task 4: Inventory analyzer and scan time budgets

**Files:**
- Create: `apps/scan-runner/src/scan_runner/budgets.py`
- Modify: `apps/scan-runner/src/scan_runner/cli.py`
- Create: `apps/scan-runner/tests/test_inventory_performance.py`

**Interfaces:**
- Consumes: `analyze_repo(root: Path, *, deadline_s: int = 120) -> dict` from `scan_runner.dpdp_inventory.analyzer` (delivered by Phase C). The returned dict has keys `inventoryVersion`, `facts`, `signals`, `detectorStatuses`.
- Produces: `INVENTORY_BUDGET_SECONDS: Final = 120`, `SCAN_DEADLINE_SECONDS: Final = 900`, and `enforce_inventory_budget(inventory_elapsed_s: float, scan_elapsed_s: float) -> str` returning `'within_budget'`, `'inventory_over_budget'`, or `'scan_over_budget'`. Task 8 reads the constants from this file.

- [x] **Step 1: Write the failing test**

```python
# apps/scan-runner/tests/test_inventory_performance.py
"""Offline performance budget checks for the in-pod inventory analyzer."""

from __future__ import annotations

import json
import time
from pathlib import Path

from scan_runner.budgets import (
    INVENTORY_BUDGET_SECONDS,
    SCAN_DEADLINE_SECONDS,
    enforce_inventory_budget,
)
from scan_runner.dpdp_inventory.analyzer import analyze_repo

CANARY = "CANARY_PHASE_F_PERF_NEVER_EMIT"
FILE_BYTES = 900 * 1024
FILE_COUNT = 120


def _make_large_repo(root: Path) -> Path:
    repo = root / "large"
    repo.mkdir(parents=True, exist_ok=True)
    chunk = (
        f"# {CANARY}\n"
        "def fixture_function(value):\n"
        "    return {'field': value, 'consent_gate': True}\n"
    ).encode("utf-8")
    payload = (chunk * 30000)[:FILE_BYTES]
    for index in range(FILE_COUNT):
        (repo / f"module_{index:03d}.py").write_bytes(payload)
    return repo


def test_budget_constants_and_enforcement() -> None:
    assert INVENTORY_BUDGET_SECONDS == 120
    assert SCAN_DEADLINE_SECONDS == 900
    assert enforce_inventory_budget(119.9, 899.9) == "within_budget"
    assert enforce_inventory_budget(120.1, 899.9) == "inventory_over_budget"
    assert enforce_inventory_budget(119.9, 900.1) == "scan_over_budget"


def test_inventory_analyzer_finishes_100mb_repo_inside_budget(tmp_path: Path) -> None:
    repo = _make_large_repo(tmp_path)
    assert sum(path.stat().st_size for path in repo.iterdir()) > 100 * 1024 * 1024

    started = time.perf_counter()
    report = analyze_repo(repo, deadline_s=INVENTORY_BUDGET_SECONDS)
    elapsed = time.perf_counter() - started

    assert elapsed <= INVENTORY_BUDGET_SECONDS
    assert report["inventoryVersion"] == "inventory-1.0.0"
    assert set(report["detectorStatuses"].values()) <= {"completed", "skipped"}
    assert CANARY not in json.dumps(report, sort_keys=True)
    assert enforce_inventory_budget(elapsed, elapsed + 30.0) == "within_budget"
```

- [x] **Step 2: Run the test to verify RED**

Run: `cd apps/scan-runner && python -m pytest tests/test_inventory_performance.py -v`  
Expected RED:

```text
ImportError while importing test module 'tests/test_inventory_performance.py':
cannot import name 'INVENTORY_BUDGET_SECONDS' from 'scan_runner.budgets'
```

If the error instead names `scan_runner.dpdp_inventory.analyzer`, stop and land Phase C first; that is a prerequisite, not a Phase F change. Record the exact RED line in the progress ledger.

- [x] **Step 3: Write the minimal implementation**

```python
# apps/scan-runner/src/scan_runner/budgets.py
"""Time budgets for the in-pod inventory analyzer and the whole scan."""

from __future__ import annotations

from typing import Final

INVENTORY_BUDGET_SECONDS: Final = 120
SCAN_DEADLINE_SECONDS: Final = 900


def enforce_inventory_budget(inventory_elapsed_s: float, scan_elapsed_s: float) -> str:
    """Return the first exceeded budget, or 'within_budget'."""
    if scan_elapsed_s > SCAN_DEADLINE_SECONDS:
        return "scan_over_budget"
    if inventory_elapsed_s > INVENTORY_BUDGET_SECONDS:
        return "inventory_over_budget"
    return "within_budget"
```

In `apps/scan-runner/src/scan_runner/cli.py`, add the import:

```python
from scan_runner.budgets import INVENTORY_BUDGET_SECONDS, enforce_inventory_budget
```

Then replace the Phase C analyzer call in `run_scan` — the line that reads `inventory_report = analyze_repo(workspace)` — with:

```python
        inventory_started = time.monotonic()
        inventory_report = analyze_repo(workspace, deadline_s=INVENTORY_BUDGET_SECONDS)
        inventory_elapsed_s = time.monotonic() - inventory_started
        if enforce_inventory_budget(inventory_elapsed_s, time.monotonic() - scan_started) != "within_budget":
            log.warning("inventory analyzer exceeded its time budget")
            statuses["dpdp_inventory"] = "timed_out"
```

`scan_started` is the `time.monotonic()` value already recorded at the top of `run_scan` by Phase C; if the Phase C code names it differently, rename the local variable to `scan_started` in that same block so the snippet above compiles unchanged.

- [x] **Step 4: Run the test to verify GREEN**

Run: `cd apps/scan-runner && python -m pytest tests/test_inventory_performance.py -v`  
Expected GREEN:

```text
tests/test_inventory_performance.py::test_budget_constants_and_enforcement PASSED
tests/test_inventory_performance.py::test_inventory_analyzer_finishes_100mb_repo_inside_budget PASSED
2 passed in 3.41s
```

The measured duration is environment-dependent but must be ≤120 s; the assertion, not the example timing, is the gate.

- [x] **Step 5: Run full gates and commit**

```bash
cd apps/scan-runner && python -m pytest -v && ruff check . && mypy src tests
cd ../..
pnpm lint && pnpm typecheck && pnpm test
git add apps/scan-runner/src/scan_runner/budgets.py apps/scan-runner/src/scan_runner/cli.py apps/scan-runner/tests/test_inventory_performance.py
git commit -m "feat(scan-runner): enforce inventory and scan time budgets"
```

Expected: all Python and TypeScript gates exit 0.

---

### Task 5: Detector-error budget and named coverage banners

**Files:**
- Create: `apps/orchestrator/src/modules/scoring/coverage-banners.ts`
- Modify: `apps/orchestrator/src/modules/reports/report-view-model.ts`
- Create: `apps/orchestrator/test/phase-f-detector-budget.test.ts`
- Create: `apps/web/test/phase-f-detector-banner.test.ts`

**Interfaces:**
- Consumes: `evaluateControls`, `type EvidenceLike`, `type DetectorStatus` from `../src/modules/scoring/control-evaluator.js`; `loadRulePack` from `../src/modules/rule-pack/rule-pack.loader.js`; `buildReportViewModel`, `type ReportSource` from `../src/modules/reports/report-view-model.js`; `NewScanDetail` from `../app/components/new/NewScanDetail.vue`; `type ScanDetail` from `../shared/scan`.
- Produces: `interface CoverageBanner { detector: string; status: DetectorStatus; reasonCode: 'detector_unavailable'; controlCodes: string[]; message: string }` and `buildCoverageBanners(detectorStatuses: Readonly<Record<string, DetectorStatus>>, unknownControls: readonly string[]): CoverageBanner[]`. `buildReportViewModel` produces a new `coverageBanners: CoverageBanner[]` field. Task 8 consumes `buildCoverageBanners`.

- [x] **Step 1: Write the failing orchestrator test**

```ts
// apps/orchestrator/test/phase-f-detector-budget.test.ts
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateControls, type EvidenceLike } from '../src/modules/scoring/control-evaluator.js';
import { buildCoverageBanners } from '../src/modules/scoring/coverage-banners.js';
import {
  buildReportViewModel,
  type ReportSource,
} from '../src/modules/reports/report-view-model.js';
import { loadRulePack } from '../src/modules/rule-pack/rule-pack.loader.js';

const packDir = fileURLToPath(new URL('../../../packages/rule-packs', import.meta.url));
const CODE = 'DPDPA-8.4-SECRET-01';
type Status = 'completed' | 'failed' | 'timed_out' | 'skipped';

function finding(overrides: Partial<EvidenceLike> = {}): EvidenceLike {
  return {
    controlCode: CODE,
    kind: 'violation',
    scanner: 'gitleaks',
    scannerRuleId: 'generic-api-key',
    evidenceHash: 'sha256:' + 'a'.repeat(64),
    fingerprint: 'fixture:phase-f:secret',
    severity: 'critical',
    confidence: 'direct',
    status: 'open',
    ...overrides,
  };
}

async function evaluate(statuses: Record<string, Status>, findings: EvidenceLike[]) {
  const pack = await loadRulePack(packDir);
  return evaluateControls({
    controls: pack.controls.filter((control) => control.code === CODE),
    facts: { languages: ['java'] },
    mappings: pack.mappings,
    detectorStatuses: statuses,
    findings,
    rulePackVersion: pack.pack,
    scoringVersion: 'scoring-2.0.0',
  });
}

const allCompleted: Record<string, Status> = {
  semgrep: 'completed',
  checkov: 'completed',
  gitleaks: 'completed',
};

describe('Phase F detector error budget', () => {
  it('turns a detector timeout into UNKNOWN with detector_unavailable', async () => {
    const evaluation = await evaluate(
      { ...allCompleted, gitleaks: 'timed_out' },
      [],
    );
    const result = evaluation.results[0]!;
    expect(result.verdict).toBe('UNKNOWN');
    expect(result.reasonCode).toBe('detector_unavailable');
    expect(evaluation.unknownControls).toContain(CODE);
  });

  it('keeps a direct finding from a completed detector as FAIL during another detector crash', async () => {
    const evaluation = await evaluate(
      { ...allCompleted, gitleaks: 'failed' },
      [finding({ scanner: 'semgrep', scannerRuleId: 'dpdpa.secret' })],
    );
    const result = evaluation.results[0]!;
    expect(result.verdict).toBe('FAIL');
    expect(result.evidence[0]?.fingerprint).toBe('fixture:phase-f:secret');
  });

  it('never reuses a previous PASS when a required detector later fails', async () => {
    const before = await evaluate(allCompleted, [
      finding({ kind: 'positive', scanner: 'semgrep', confidence: 'direct' }),
    ]);
    expect(before.results[0]?.verdict).toBe('PASS');

    const after = await evaluate({ ...allCompleted, gitleaks: 'failed' }, []);
    expect(after.results[0]?.verdict).toBe('UNKNOWN');
    expect(after.results[0]?.verdict).not.toBe('PASS');
  });

  it('produces a named coverage banner for each non-completed detector', () => {
    expect(
      buildCoverageBanners(
        { gitleaks: 'timed_out', semgrep: 'completed' },
        [CODE],
      ),
    ).toEqual([
      {
        detector: 'gitleaks',
        status: 'timed_out',
        reasonCode: 'detector_unavailable',
        controlCodes: [CODE],
        message: 'Could not determine from code: gitleaks timed_out.',
      },
    ]);
    expect(buildCoverageBanners(allCompleted, [CODE])).toEqual([]);
  });

  it('puts the named banners in the report view model', () => {
    const source = {
      report: {
        id: 'rpt-phase-f',
        format: 'PDF',
        templateVersion: 'v1',
        createdAt: new Date('2026-11-27T00:00:00Z'),
      },
      scan: {
        id: 'scn-phase-f',
        repository: { id: 'repo-1', fullName: 'acme/repo', visibility: 'PUBLIC' },
        ref: 'main',
        commitSha: null,
        status: 'completed',
        score: null,
        grade: null,
        sectionScores: {},
        counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
        coverage: { gitleaks: 'timed_out' },
        coverageStatus: 'partial',
        scannerVersions: {},
        rulePackVersion: 'dpdpa-2026.10.6',
        scoringVersion: 'scoring-2.0.0',
        unknownControls: [CODE],
        queuedAt: new Date('2026-11-27T00:00:00Z'),
        startedAt: new Date('2026-11-27T00:00:10Z'),
        completedAt: new Date('2026-11-27T00:01:00Z'),
        durationMs: 50_000,
      },
      organization: {
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        dataRegion: 'IN',
        settings: {},
      },
      findings: [],
    } as unknown as ReportSource;

    expect(buildReportViewModel(source).coverageBanners).toEqual([
      {
        detector: 'gitleaks',
        status: 'timed_out',
        reasonCode: 'detector_unavailable',
        controlCodes: [CODE],
        message: 'Could not determine from code: gitleaks timed_out.',
      },
    ]);
  });
});
```

- [x] **Step 2: Write the failing web test**

```ts
// apps/web/test/phase-f-detector-banner.test.ts
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';
import NewScanDetail from '../app/components/new/NewScanDetail.vue';
import type { ScanDetail } from '../shared/scan';

const scan = {
  id: 'scn_phase_f',
  status: 'completed',
  coverage: { gitleaks: 'timed_out' },
  repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
  ref: 'main',
  commitSha: null,
  previousScore: null,
  sectionScores: {},
  counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
  scannerVersions: {},
  rulePackVersion: 'dpdpa-2026.10.6',
  scoringVersion: 'scoring-2.0.0',
  score: null,
  grade: null,
  assessment: {
    score: null,
    evidenceCoverage: 0,
    openGaps: 0,
    verdictCounts: { UNKNOWN: 1 },
    unknownControls: ['DPDPA-8.4-SECRET-01'],
    detectorStatuses: { gitleaks: 'timed_out' },
    gradeWithheldReason: 'insufficient_evidence',
    consentGatingRatio: null,
  },
  error: null,
  timestamps: {
    queuedAt: '2026-11-27T00:00:00Z',
    startedAt: '2026-11-27T00:00:10Z',
    completedAt: '2026-11-27T00:01:00Z',
    durationMs: 50_000,
  },
  links: { findings: '', events: '', report: '' },
} as unknown as ScanDetail;

describe('Phase F named coverage banner', () => {
  it('names the timed-out detector next to the unknown control count', async () => {
    const wrapper = await mountSuspended(NewScanDetail, { props: { scan } });
    const banner = wrapper
      .findAll('[role="status"]')
      .find((node) => node.text().includes('Detector status'));
    expect(banner).toBeDefined();
    expect(banner?.text()).toContain('gitleaks timed_out');
    expect(wrapper.text()).toContain('1 controls could not be determined');
  });
});
```

- [x] **Step 3: Run both tests to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-detector-budget.test.ts`  
Expected RED:

```text
Error: Failed to load url ../../src/modules/scoring/coverage-banners.js
Test Files  1 failed (1)
```

Run: `pnpm --filter @dpdpa/web test -- phase-f-detector-banner.test.ts`  
Expected RED (the component's banner exists, but the focused test file is new and must be recorded before implementation):

```text
FAIL  apps/web/test/phase-f-detector-banner.test.ts > Phase F named coverage banner > names the timed-out detector next to the unknown control count
Test Files  1 failed (1)
Tests       1 failed (1)
```

If the web test already passes, record that fact in the ledger and do not modify `NewScanDetail.vue`; its banner behavior was delivered in Phase E. The production change for this task is the orchestrator module and report view model below.

- [x] **Step 4: Write the minimal implementation**

```ts
// apps/orchestrator/src/modules/scoring/coverage-banners.ts
import type { DetectorStatus } from './control-evaluator.js';

export interface CoverageBanner {
  detector: string;
  status: DetectorStatus;
  reasonCode: 'detector_unavailable';
  controlCodes: string[];
  message: string;
}

/** Readiness-only banner naming every detector that could not complete. */
export function buildCoverageBanners(
  detectorStatuses: Readonly<Record<string, DetectorStatus>>,
  unknownControls: readonly string[],
): CoverageBanner[] {
  const controls = [...unknownControls].sort();
  return Object.entries(detectorStatuses)
    .filter(([, status]) => status !== 'completed')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([detector, status]) => ({
      detector,
      status,
      reasonCode: 'detector_unavailable' as const,
      controlCodes: controls,
      message: `Could not determine from code: ${detector} ${status}.`,
    }));
}
```

In `apps/orchestrator/src/modules/reports/report-view-model.ts`, add the import at the top:

```ts
import { buildCoverageBanners } from '../scoring/coverage-banners.js';
```

Then insert this field immediately after the `methodology` property inside the object returned by `buildReportViewModel`:

```ts
    coverageBanners: buildCoverageBanners(
      Object.fromEntries(
        Object.entries(scan.coverage ?? {}).map(([name, value]) => [
          name,
          typeof value === 'string' &&
          ['completed', 'failed', 'timed_out', 'skipped'].includes(value)
            ? (value as 'completed' | 'failed' | 'timed_out' | 'skipped')
            : 'skipped',
        ]),
      ),
      Array.isArray(scan.unknownControls)
        ? scan.unknownControls.filter((code): code is string => typeof code === 'string')
        : [],
    ),
```

- [x] **Step 5: Run both tests to verify GREEN**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-detector-budget.test.ts`  
Expected GREEN:

```text
✓ apps/orchestrator/test/phase-f-detector-budget.test.ts (5 tests) 84ms
Test Files  1 passed (1)
Tests       5 passed (5)
```

Run: `pnpm --filter @dpdpa/web test -- phase-f-detector-banner.test.ts`  
Expected GREEN:

```text
✓ apps/web/test/phase-f-detector-banner.test.ts (1 test) 310ms
Test Files  1 passed (1)
Tests       1 passed (1)
```

- [x] **Step 6: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/orchestrator/src/modules/scoring/coverage-banners.ts apps/orchestrator/src/modules/reports/report-view-model.ts apps/orchestrator/test/phase-f-detector-budget.test.ts apps/web/test/phase-f-detector-banner.test.ts
git commit -m "feat(scoring): surface named coverage banners for detector errors"
```

Expected: all three gates exit 0; existing report view-model tests stay green.

---

### Task 6: Legal review record in the rule-pack changelog

**Files:**
- Create: `packages/rule-packs/v2/CHANGELOG.md`
- Create: `apps/orchestrator/test/phase-f-legal-review.test.ts`

**Interfaces:**
- Consumes: none beyond Node filesystem APIs.
- Produces: a stable `## Legal review — 2026.11.0` section with `Reviewer:`, `Review date:`, `Status:`, and the three official gazette URLs. Task 8 reads the same file.

- [x] **Step 1: Write the failing test**

```ts
// apps/orchestrator/test/phase-f-legal-review.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const changelog = () =>
  readFileSync(join(root, 'packages/rule-packs/v2/CHANGELOG.md'), 'utf8');

const OFFICIAL_URLS = [
  'https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf',
  'https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf',
  'https://www.meity.gov.in/static/uploads/2025/12/3c7ebbae0e5456f493f486e6845df86b.pdf',
];

describe('Phase F legal review record', () => {
  it('records a reviewer and an ISO review date for dpdpa-2026.11.0', () => {
    const text = changelog();
    expect(text).toContain('## Legal review — 2026.11.0');
    expect(text).toMatch(/^- Reviewer: .+/m);
    expect(text).toMatch(/^- Review date: \d{4}-\d{2}-\d{2}$/m);
  });

  it('records the re-verified official gazette URLs', () => {
    const text = changelog();
    for (const url of OFFICIAL_URLS) expect(text).toContain(url);
  });

  it('states that no legal opinion, certificate, badge, or pilot sign-off is claimed', () => {
    expect(changelog()).toContain(
      'No legal opinion, certificate, badge, or pilot sign-off is claimed.',
    );
  });
});
```

- [x] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-legal-review.test.ts`  
Expected RED:

```text
Error: ENOENT: no such file or directory, open 'packages/rule-packs/v2/CHANGELOG.md'
Test Files  1 failed (1)
Tests       3 failed (3)
```

- [x] **Step 3: Re-verify the official URLs and write the changelog**

Before writing, open each of the three URLs in the test with `webfetch` and confirm it still resolves to the MeitY gazette document. If a URL has moved, record the replacement URL in the changelog and update `OFFICIAL_URLS` in the test to the same value. Use the actual date of that check as `Review date:`; the value below (2026-11-27) is correct when the check is performed today.

```markdown
<!-- packages/rule-packs/v2/CHANGELOG.md -->
# Rule pack v2 changelog

## Legal review — 2026.11.0

- Reviewer: internal legal counsel (role recorded; no individual sign-off claimed in the repository)
- Review date: 2026-11-27
- Status: recorded for the Phase F release gate. No legal opinion, certificate, badge, or pilot sign-off is claimed.
- Official URLs re-verified on 2026-11-27:
  - https://www.meity.gov.in/static/uploads/2024/06/2bf1f0e9f04e6fb4f8fef35e82c42aa5.pdf
  - https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
  - https://www.meity.gov.in/static/uploads/2025/12/3c7ebbae0e5456f493f486e6845df86b.pdf
- Commencement baseline recorded in `commencement.yaml`: Rules 1, 2 and 17–21 from 13 Nov 2025; Rule 4 from 13 Nov 2026; Rules 3, 5–16, 22 and 23 from 13 May 2027. Corrigendum G.S.R. 892(E), 10 Dec 2025, is included in the baseline.
- Report and UI copy remain readiness-only. Legal wording is reviewed against `docs/legal/legal-copy-review-checklist.md`; quoted disclaimers are the only place where forbidden wording may appear.
```

- [x] **Step 4: Run the test to verify GREEN**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-legal-review.test.ts`  
Expected GREEN:

```text
✓ apps/orchestrator/test/phase-f-legal-review.test.ts (3 tests) 20ms
Test Files  1 passed (1)
Tests       3 passed (3)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add packages/rule-packs/v2/CHANGELOG.md apps/orchestrator/test/phase-f-legal-review.test.ts
git commit -m "docs(legal): record Phase F rule-pack legal review"
```

Expected: all three gates exit 0.

---

### Task 7: Beta false-positive gate before default display

**Files:**
- Create: `apps/orchestrator/src/modules/scoring/beta-gate.ts`
- Create: `docs/records/phase-f-beta-false-positive-review.json`
- Create: `docs/records/phase-f-beta-false-positive-review.md`
- Create: `apps/orchestrator/test/phase-f-beta-gate.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks except filesystem paths; `type BetaReviewRecord` / `evaluateBetaGate` are defined here.
- Produces: `interface BetaControlReview { controlCode: string; falsePositive: boolean }`, `interface BetaRepositoryReview { repository: string; directConfidenceControls: readonly BetaControlReview[] }`, `interface BetaReviewRecord { status: 'pending_explicit_approval' | 'approved'; defaultDisplayEnabled: boolean; targetMaxFalsePositiveRate: number; minRepositories: number; maxRepositories: number; repositories: readonly BetaRepositoryReview[] }`, `interface BetaGateDecision { allowed: boolean; falsePositiveRate: number | null; reason: 'approved' | 'not_approved' | 'repository_count_out_of_range' | 'no_direct_controls' | 'false_positive_rate_too_high' }`, and `evaluateBetaGate(record: BetaReviewRecord): BetaGateDecision`. Task 8 consumes `evaluateBetaGate`.

- [x] **Step 1: Write the failing test**

```ts
// apps/orchestrator/test/phase-f-beta-gate.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { evaluateBetaGate, type BetaReviewRecord } from '../src/modules/scoring/beta-gate.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

function record(repositories: BetaReviewRecord['repositories']): BetaReviewRecord {
  return {
    status: 'approved',
    defaultDisplayEnabled: false,
    targetMaxFalsePositiveRate: 0.1,
    minRepositories: 5,
    maxRepositories: 10,
    repositories,
  };
}

/** Synthetic test inputs only; never pilot evidence or sign-off data. */
function reviewSet(count: number, falsePositives: number): BetaReviewRecord['repositories'] {
  return Array.from({ length: count }, (_, repoIndex) => ({
    repository: `test-repo-${repoIndex}`,
    directConfidenceControls: Array.from({ length: 4 }, (_, controlIndex) => ({
      controlCode: `DPDPA-8.4-SECRET-${String(controlIndex + 1).padStart(2, '0')}`,
      falsePositive: repoIndex * 4 + controlIndex < falsePositives,
    })),
  }));
}

describe('Phase F beta false-positive gate', () => {
  it('allows default display at 6.25% false positives across 8 reviewed repositories', () => {
    expect(evaluateBetaGate(record(reviewSet(8, 2)))).toEqual({
      allowed: true,
      falsePositiveRate: 0.0625,
      reason: 'approved',
    });
  });

  it('blocks default display at 15% false positives', () => {
    expect(evaluateBetaGate(record(reviewSet(5, 3)))).toEqual({
      allowed: false,
      falsePositiveRate: 0.15,
      reason: 'false_positive_rate_too_high',
    });
  });

  it('blocks fewer than 5 or more than 10 repositories', () => {
    expect(evaluateBetaGate(record(reviewSet(4, 0))).reason).toBe(
      'repository_count_out_of_range',
    );
    expect(evaluateBetaGate(record(reviewSet(11, 0))).reason).toBe(
      'repository_count_out_of_range',
    );
  });

  it('blocks a pending or empty review and a review with no direct controls', () => {
    expect(evaluateBetaGate({ ...record(reviewSet(8, 0)), status: 'pending_explicit_approval' })).toEqual({
      allowed: false,
      falsePositiveRate: null,
      reason: 'not_approved',
    });
    expect(evaluateBetaGate(record([])).reason).toBe('repository_count_out_of_range');
    expect(
      evaluateBetaGate(record(reviewSet(5, 0).map((repo) => ({ ...repo, directConfidenceControls: [] })))).reason,
    ).toBe('no_direct_controls');
  });

  it('ships with default display disabled and no pilot evidence', () => {
    const shipped = JSON.parse(
      readFileSync(join(root, 'docs/records/phase-f-beta-false-positive-review.json'), 'utf8'),
    ) as BetaReviewRecord;
    expect(shipped.status).toBe('pending_explicit_approval');
    expect(shipped.defaultDisplayEnabled).toBe(false);
    expect(shipped.repositories).toEqual([]);
    expect(evaluateBetaGate(shipped).allowed).toBe(false);
  });
});
```

- [x] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-beta-gate.test.ts`  
Expected RED:

```text
Error: Failed to load url ../../src/modules/scoring/beta-gate.js
Test Files  1 failed (1)
```

- [x] **Step 3: Write the minimal implementation and records**

```ts
// apps/orchestrator/src/modules/scoring/beta-gate.ts
export interface BetaControlReview {
  controlCode: string;
  falsePositive: boolean;
}

export interface BetaRepositoryReview {
  repository: string;
  directConfidenceControls: readonly BetaControlReview[];
}

export interface BetaReviewRecord {
  status: 'pending_explicit_approval' | 'approved';
  defaultDisplayEnabled: boolean;
  targetMaxFalsePositiveRate: number;
  minRepositories: number;
  maxRepositories: number;
  repositories: readonly BetaRepositoryReview[];
}

export interface BetaGateDecision {
  allowed: boolean;
  falsePositiveRate: number | null;
  reason:
    | 'approved'
    | 'not_approved'
    | 'repository_count_out_of_range'
    | 'no_direct_controls'
    | 'false_positive_rate_too_high';
}

/** Pure gate: direct-confidence controls only, no fixtures and no pilot data. */
export function evaluateBetaGate(record: BetaReviewRecord): BetaGateDecision {
  if (record.status !== 'approved') {
    return { allowed: false, falsePositiveRate: null, reason: 'not_approved' };
  }
  const count = record.repositories.length;
  if (count < record.minRepositories || count > record.maxRepositories) {
    return { allowed: false, falsePositiveRate: null, reason: 'repository_count_out_of_range' };
  }
  const controls = record.repositories.flatMap((repo) => repo.directConfidenceControls);
  if (controls.length === 0) {
    return { allowed: false, falsePositiveRate: null, reason: 'no_direct_controls' };
  }
  const falsePositiveRate = controls.filter((control) => control.falsePositive).length / controls.length;
  if (falsePositiveRate > record.targetMaxFalsePositiveRate) {
    return { allowed: false, falsePositiveRate, reason: 'false_positive_rate_too_high' };
  }
  return { allowed: true, falsePositiveRate, reason: 'approved' };
}
```

```json
{
  "status": "pending_explicit_approval",
  "defaultDisplayEnabled": false,
  "targetMaxFalsePositiveRate": 0.1,
  "minRepositories": 5,
  "maxRepositories": 10,
  "repositories": []
}
```

```markdown
<!-- docs/records/phase-f-beta-false-positive-review.md -->
# Phase F beta false-positive review

Status: pending_explicit_approval
Default display: disabled
Target: ≤10% false positives on direct-confidence controls across 5–10 approved beta repositories before default display is enabled.

No beta repositories have been reviewed. Live scans and pilot sign-off require explicit user approval. Fixtures under `tests/golden-repos/` are test inputs only and must never be used as pilot evidence or sign-off data.

`phase-f-beta-false-positive-review.json` is the machine-readable gate input. `evaluateBetaGate` returns `allowed: true` only when the record is `approved`, contains 5–10 repositories, has at least one direct-confidence control, and the false-positive rate is ≤0.10. Default display stays disabled until that condition is met and the user explicitly approves display.

This record makes no pilot sign-off claim and does not authorize a live scan.
```

- [x] **Step 4: Run the test to verify GREEN**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-beta-gate.test.ts`  
Expected GREEN:

```text
✓ apps/orchestrator/test/phase-f-beta-gate.test.ts (5 tests) 33ms
Test Files  1 passed (1)
Tests       5 passed (5)
```

- [x] **Step 5: Run full gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add apps/orchestrator/src/modules/scoring/beta-gate.ts apps/orchestrator/test/phase-f-beta-gate.test.ts docs/records/phase-f-beta-false-positive-review.json docs/records/phase-f-beta-false-positive-review.md
git commit -m "feat(scoring): block beta default display until FP target is met"
```

Expected: all three gates exit 0.

---

### Task 8: Phase F exit gate, fresh review, and commit

**Files:**
- Create: `apps/orchestrator/test/phase-f-exit-gate.test.ts`
- Create: `docs/records/phase-f-readiness-status.md`
- Modify: this plan file (check boxes and recorded evidence only)

**Interfaces:**
- Consumes: `canonicalControlResultsBytes` (Task 2), `redactedSinks` (Task 3), `buildCoverageBanners` (Task 5), `evaluateBetaGate` (Task 7), `fixtureDirs`, `canaryMarker`, `runFixture` (Task 1).
- Produces: one exit-gate test that covers every Definition of Done item except Phase G, plus the recorded readiness status. No new runtime behavior.

- [x] **Step 1: Write the failing exit-gate test**

```ts
// apps/orchestrator/test/phase-f-exit-gate.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateBetaGate, type BetaReviewRecord } from '../src/modules/scoring/beta-gate.js';
import { canonicalControlResultsBytes } from '../src/modules/scoring/control-results-canonical.js';
import { buildCoverageBanners } from '../src/modules/scoring/coverage-banners.js';
import { redactedSinks } from '../src/modules/scoring/redacted-sinks.js';
import { canaryMarker, fixtureDirs, runFixture } from './helpers/phase-f-fixture.js';

const root = fileURLToPath(new URL('../../..', import.meta.url));

describe('Phase F exit gate (all Definition of Done items except Phase G)', () => {
  it('covers the full fixture corpus with deterministic, canary-contained results', async () => {
    expect(fixtureDirs()).toHaveLength(21);
    for (const dir of fixtureDirs()) {
      const marker = canaryMarker(dir);
      const first = await runFixture(dir);
      const second = await runFixture(dir);
      expect(canonicalControlResultsBytes(first.evaluation.results)).toBe(
        canonicalControlResultsBytes(second.evaluation.results),
      );
      expect(first.evaluation.results.every((result) => result.scoringVersion === 'scoring-2.0.0')).toBe(
        true,
      );
      const sinks = redactedSinks({
        controlResults: first.evaluation.results,
        findings: first.findings,
        score: first.scored,
        verdictCounts: first.scored.verdictCounts,
        unknownControls: first.scored.unknownControls,
        detectorStatuses: first.detectorStatuses,
        evidenceCoverage: first.scored.evidenceCoverage,
      });
      expect(Object.values(sinks).some((text) => text.includes(marker))).toBe(false);
      expect(first.scored.counts.unmapped).toBe(first.name === 'unmapped-rule' ? 1 : 0);
    }
  });

  it('keeps detector errors UNKNOWN with a named banner', () => {
    expect(
      buildCoverageBanners({ gitleaks: 'timed_out' }, ['DPDPA-8.4-SECRET-01']),
    ).toEqual([
      {
        detector: 'gitleaks',
        status: 'timed_out',
        reasonCode: 'detector_unavailable',
        controlCodes: ['DPDPA-8.4-SECRET-01'],
        message: 'Could not determine from code: gitleaks timed_out.',
      },
    ]);
  });

  it('keeps the inventory and scan deadlines explicit', () => {
    const budgets = readFileSync(
      join(root, 'apps/scan-runner/src/scan_runner/budgets.py'),
      'utf8',
    );
    expect(budgets).toMatch(/INVENTORY_BUDGET_SECONDS:\s*Final\s*=\s*120/);
    expect(budgets).toMatch(/SCAN_DEADLINE_SECONDS:\s*Final\s*=\s*900/);
    expect(budgets).toContain('def enforce_inventory_budget(');
  });

  it('records the legal review and official URLs before release', () => {
    const changelog = readFileSync(
      join(root, 'packages/rule-packs/v2/CHANGELOG.md'),
      'utf8',
    );
    expect(changelog).toContain('## Legal review — 2026.11.0');
    expect(changelog).toMatch(/^- Reviewer: .+/m);
    expect(changelog).toMatch(/^- Review date: \d{4}-\d{2}-\d{2}$/m);
    expect(changelog).toContain('G.S.R. 892(E)');
  });

  it('blocks beta default display and makes no pilot sign-off or Phase G claim', () => {
    const review = JSON.parse(
      readFileSync(
        join(root, 'docs/records/phase-f-beta-false-positive-review.json'),
        'utf8',
      ),
    ) as BetaReviewRecord;
    expect(evaluateBetaGate(review).allowed).toBe(false);
    expect(review.defaultDisplayEnabled).toBe(false);

    const status = readFileSync(
      join(root, 'docs/records/phase-f-readiness-status.md'),
      'utf8',
    );
    expect(status).toContain('No pilot sign-off is claimed');
    expect(status).toContain('Phase G live verification is not performed');
    expect(status).toContain('Pending — deferred for internal pilot');
  });
});
```

- [x] **Step 2: Run the test to verify RED**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-exit-gate.test.ts`  
Expected RED:

```text
Error: ENOENT: no such file or directory, open 'docs/records/phase-f-readiness-status.md'
Test Files  1 failed (1)
Tests       1 failed | 4 passed (5)
```

- [x] **Step 3: Write the readiness status record**

```markdown
<!-- docs/records/phase-f-readiness-status.md -->
# Phase F readiness status

Status: readiness assessment only.
No pilot sign-off is claimed. Fixtures are test inputs only and must never be presented as pilot evidence or sign-off data.
Phase G live verification is not performed; it remains deferred pending a separate threat-model review.
External pentest for non-internal exposure: Pending — deferred for internal pilot.
No push, PR, merge, deploy, image-pin change, or `infra/` change without explicit user approval.
All scores are displayed beside evidence coverage, open gaps, and the count of controls that could not be determined.
```

- [x] **Step 4: Run the test to verify GREEN**

Run: `pnpm --filter @dpdpa/orchestrator test -- phase-f-exit-gate.test.ts`  
Expected GREEN:

```text
✓ apps/orchestrator/test/phase-f-exit-gate.test.ts (5 tests) 121ms
Test Files  1 passed (1)
Tests       5 passed (5)
```

- [x] **Step 5: Run every gate and record exact output**

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dpdpa/orchestrator test -- phase-f-fixtures.test.ts phase-f-determinism.test.ts phase-f-canary-containment.test.ts phase-f-detector-budget.test.ts phase-f-legal-review.test.ts phase-f-beta-gate.test.ts phase-f-exit-gate.test.ts
pnpm --filter @dpdpa/web test -- readiness-language.test.ts phase-f-detector-banner.test.ts
pnpm --filter @dpdpa/rule-packs test
cd apps/scan-runner && python -m pytest -v && ruff check . && mypy src tests
cd ../..
git diff --check
```

Expected: every command exits 0; `pnpm test` reports `Tasks: 10 successful, 10 total`; rule-packs reports 2 test files / 15 tests; the runner reports every test passing. Full-gate logs contain intentional error-path fixtures; those are not failures. Copy the exact summaries into the progress ledger.

- [x] **Step 6: Fresh-context review**

Dispatch a fresh-context general subagent with no write access. Prompt it to review only the Phase F diff (from the Phase E HEAD to `HEAD`) for Required defects against the spec, especially:

1. No source file content or canary marker reaches DB, object storage, logs, callbacks, or API responses.
2. Every fixture is run twice with byte-identical canonical `control_results`; `UNKNOWN` is never credited as a pass.
3. `detector_unavailable` short-circuits to `UNKNOWN` unless a direct/corroborated finding from a completed detector exists, which still yields `FAIL`.
4. Inventory budget is 120 s on a 100 MB repo and the scan deadline is 900 s.
5. Legal record has reviewer, ISO date, and re-verified official URLs; beta default display is blocked without an approved 5–10 repo ≤10% review.
6. No forbidden wording outside quoted disclaimers, no pilot sign-off claim, no Phase G live verification, no push/PR/merge/deploy.

Do not let the reviewer modify files. Fix every Required finding with its own RED/GREEN cycle, then rerun Step 5 until clean.

- [x] **Step 7: Update the plan truthfully and commit**

Tick every completed checkbox in this plan, paste the exact gate summaries and the fresh-review verdict into the progress ledger, then commit only the plan/evidence files:

```bash
git add docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-f.md
git commit -m "docs(plan): record Phase F completion evidence"
```

- [ ] **Step 8: Report and ask for approval**

Report the branch, commit list, exact gate output, and the fact that no manual WebGoat/Juice-Shop/live-API scan was run. Ask explicitly before any push, PR, rebase onto `main`, merge, deploy, image-pin change, or `infra/` change. Do not claim a pilot sign-off, a compliance verdict, a certificate, or Phase G readiness.

---

## Definition of Done

- [x] All Tasks 1–8 are GREEN with exact RED/GREEN excerpts recorded in the progress ledger.
- [x] 21 golden fixtures have manifests, exactly one source canary each, no live URLs, and no canary in manifests.
- [x] Every fixture runs twice with byte-identical canonical `control_results`; versioned scoring is recorded on every result; no timestamps or generated UUIDs appear in serialized results.
- [x] Canary markers are absent from DB rows, object-storage reports, logs, callbacks, and API fields; the signed callback allowlist is enforced in the runner.
- [x] The 100 MB synthetic-repo inventory run completes within 120 s, with a 900 s total scan deadline constant and `enforce_inventory_budget`.
- [x] Detector crash/timeout yields `UNKNOWN` with `detector_unavailable`, a named coverage banner, and no reused PASS; a direct finding from a completed detector still yields `FAIL`.
- [x] Report v2 view model carries the named banners and the UI names the timed-out detector beside the unknown count.
- [x] Legal reviewer, review date, and re-verified official URLs are in `packages/rule-packs/v2/CHANGELOG.md`.
- [x] Beta default display is blocked unless an approved record covers 5–10 repositories and ≤10% direct-confidence false positives; shipped record is pending with no repositories.
- [x] `pnpm lint && pnpm typecheck && pnpm test`, rule-packs tests, web language/banner tests, and runner pytest/ruff/mypy are all green.
- [x] No forbidden wording outside quoted disclaimers, no source/canary retention, no pilot data used as evidence.
- [x] No real pilot sign-off claim; Phase G live verification remains deferred; no push, PR, merge, deploy, image-pin change, or `infra/` change without explicit approval.
- [x] Fresh-context review has no Required defects.

# Evidence-backed DPDPA readiness — Phase B foundation design

**Date:** 2026-11-27  
**Status:** Written spec for user review; design direction approved in brainstorming  
**Parent spec:** `docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md`  
**Related ADR:** `docs/decisions/0001-evidence-backed-dpdp-readiness.md`  
**Branch:** `feat/dpdp-readiness-phase-b`, stacked from Phase A HEAD `0334b5f`; rebase onto `main` after PR #104 merges  
**Scope:** Phase B only — v2 contracts, rule-pack foundation, additive migrations, validators, version bump

## Context

Phase A established the verdict model, `control_results`, the pure evaluator, version-dispatched scoring, and the readiness UI using the existing `dpdpa-2026.10.6` pack. The approved A–F program now needs a structurally valid v2 pack and storage shape before inventory logic, substantive controls, attestations, UI pages, or report v2 can be added.

Phase B is a foundation PR. It must not change runtime scoring, evaluator behavior, legacy scans, or user-visible output. Its exit gate is that pack validation rejects orphan/missing rules and the v1 pack still loads.

## Decision

Use the schema-first stacked foundation approach:

1. Extend contracts as the source of truth.
2. Add a separate, structurally complete but content-light `dpdpa-2026.11.0` pack tree.
3. Add a validator that runs in CI and at v2 load time.
4. Add only the additive migrations not already delivered by Phase A.
5. Export version constants without touching legacy scoring data.

## Scope

### In scope

- New v2 contract schemas for inventory facts/signals, control definitions, absence/positive rules, detector definitions, attestations, and the v2 pack manifest.
- A `packages/rule-packs/v2/` directory with the file structure required by the parent spec and a deterministic SHA-256 manifest.
- A pack validator with structured issues and a non-zero CLI exit on failure.
- Additive Prisma migrations for inventory/consent columns on `scans` and an org/repo-scoped `attestations` table.
- Version constants `dpdpa-2026.11.0` and `inventory-1.0.0`.
- Contract, validator, manifest, v1-regression, and migration tests.

### Out of scope

- Inventory analyzer implementation or callback changes.
- Substantive control catalogue content, golden verdicts, and detector rules.
- Attestation write routes, API exposure, or UI.
- Report v2, SARIF/Markdown exports, new pages, and language-lint expansion.
- Changes to `packages/rule-packs/scoring.yaml`, `scoringVersion: "1.0.0"`, Phase A evaluator/scoring logic, legacy scores, or rendered UI.
- Live scans, pilot data, pushes after the Phase B branch is created, merge, deployment, image-pin updates, gVisor changes, and `infra/` changes.

## Architecture

Contracts are the source of truth. The v2 pack is parsed and validated against those schemas; the manifest is generated from the validated file set. The validator runs in CI and before any v2 pack is exposed to runtime code. Migrations create storage shape only; no runtime writer consumes the new columns or table in Phase B.

```text
packages/contracts (v2 schemas)
        ↓
packages/rule-packs/v2 (YAML + manifest)
        ↓
validate-v2-pack.mjs (CI + load-time, structured issues)
        ↓
additive Prisma migrations (storage only; no runtime writer yet)
```

The v1 pack path remains unchanged. A bad v2 pack or manifest must fail closed for v2 while leaving legacy loads unaffected.

## Components and interfaces

### Contracts

Extend `packages/contracts/src/readiness.ts` and export from `packages/contracts/src/index.ts`.

Reuse, do not redefine:

- `READINESS_VERDICTS` / `readinessVerdictSchema`
- `FINDING_KINDS` / `findingKindSchema`
- `DETECTOR_STATUSES` / `detectorStatusSchema`
- `CONTROL_CODE_PATTERN`
- `evidenceReferenceSchema`
- `controlResultSchema`
- `assessmentSummarySchema`

Add bounded schemas for:

- inventory facts and signals — allowlisted tokens, paths, line numbers, detector IDs, counts; no source text or matched values;
- control definitions — ID, section, `actRef`, `ruleRef`, severity, weight, `evidenceMode`, `appliesWhen`, violation/absence/positive rules, `partialCredit`, remediation, and legal references;
- absence and positive rules with search provenance fields;
- detector definitions — inputs, outputs, timeout, stacks, confidence, failure mode, and control refs;
- attestations — org/repo scope, questionnaire key, boolean `answer` (`true` = attested pass, `false` = attested fail; no credit is computed in Phase B), note, `attestedBy`, `attestedAt`, and `expiresAt`;
- the v2 pack manifest — version, pack name, generated timestamp, and SHA-256 file entries.

All new schemas are strict or bounded so unknown fields and unbounded strings/arrays are rejected.

### Rule pack v2

Add `packages/rule-packs/v2/` containing:

- `controls.yaml`
- `mappings/*.yaml`
- `detectors.yaml`
- `commencement.yaml`, `penalties.yaml`, `india-regions.yaml`, `sdk_catalog.yaml`, `field_dictionary.yaml`, `mechanism_catalog.yaml`, `cmp_catalog.yaml`, `cookie_catalog.yaml`, `security_headers.yaml`, and `ecosystem_patterns/*.yaml`
- `templates/`
- `manifest.yaml`

The initial catalogue is structurally valid and content-light. Substantive controls, golden verdicts, detection rules, and templates are populated in Phases C and D. Every control that is added must have a valid `DPDPA-<section>-<KIND>-<NN>` ID and legal references; draft-style IDs are rejected.

### Validator

Add `packages/rule-packs/scripts/validate-v2-pack.mjs` and scripts `validate` and `manifest:v2`.

`validatePackV2(packDir)` returns structured issues with `path`, `code`, and `message`. The CLI exits non-zero when any issue is present. Validation rules:

- duplicate control IDs;
- orphan detector IDs;
- non-manual control with no violation, absence, or positive rule;
- missing legal references;
- invalid commencement data;
- manifest checksum mismatch;
- schema violations, unbounded fields, or source-content-shaped fields.

Invalid fixtures live only under test paths. They may carry a canary marker but must never be included in the runtime pack or manifest.

### Migrations

Phase A already delivered `control_results`, `scanner_findings.kind/detector`, and scan-level evidence columns. Phase B adds only:

- `scans.inventoryVersion` — nullable text;
- `scans.inventoryStatus` — nullable text;
- `scans.consentGatingRatio` — nullable decimal;
- an `attestations` table scoped by org and repository with questionnaire key, boolean `answer`, note, attested-by, attested-at, expiry, and timestamps.

Migrations are additive. No backfill, rewrite, data migration, or runtime writer is included. Existing row-level access, retention, and org-scoping patterns are followed.

### Versions

Export `DPDPA_PACK_V2_VERSION = "dpdpa-2026.11.0"` and `INVENTORY_V1_VERSION = "inventory-1.0.0"` from contracts. `packages/rule-packs/scoring.yaml` and the literal legacy `scoringVersion: "1.0.0"` are unchanged.

## Error handling

- Validation issues are structured and reported per file path.
- v2 loading fails closed on any validation issue.
- The v1 loader remains on its current path; invalid v2 fixtures must not affect legacy scans.
- Migrations fail loudly through Prisma validation; no silent fallback is introduced.
- The validator never logs file contents, matched values, secret values, or canary strings.

## Verification

- Contract schema tests: valid and invalid shapes for every new schema.
- Validator tests: positive pack, duplicate control ID, orphan detector ID, missing rule, missing legal ref, invalid commencement data, and checksum drift.
- Manifest test: file entries are deterministic and byte-identical on repeat runs; the generated timestamp is metadata and is excluded from checksum comparison.
- v1 regression: existing `dpdpa-2026.10.6` pack still loads and validates.
- Migration checks: `prisma validate` and additive migration assertions.
- Full gates: `pnpm lint && pnpm typecheck && pnpm test`.
- No Playwright step because Phase B has no user-visible slice.
- Fixtures are test inputs only, never pilot evidence. No live scan or pilot data is used.

## Exit gate

Phase B is complete when pack validation rejects orphan/missing rules, v1 still loads, additive migrations validate, canary/source containment holds for fixtures, and the full gates are green.

## Alternatives considered

- **Migration-first:** easier schema reasoning, but validators depend on contracts added later in the same PR and risk drift.
- **Pack-only first:** smallest PR, but leaves the Phase B exit gate split across PRs and creates a follow-on with no independent value.
- **Schema-first stacked foundation:** chosen. It keeps contracts authoritative, DB changes additive and legacy-safe, and the validator enforceable before runtime consumers exist.

## Consequences

- Reviewers get a foundation PR with no behavior change and a clear exit gate.
- Phase C can add inventory logic and the first control set without reworking contracts or schema.
- Legal wording, substantive controls, detector content, attestations, UI, and report v2 remain explicit later-phase work.
- The stacked branch will need a rebase onto `main` after PR #104 merges.

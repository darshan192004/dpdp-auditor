# Phase B implementation plan — evidence-backed DPDPA readiness foundation

**Spec:** `docs/superpowers/specs/2026-11-27-dpdp-readiness-phase-b-design.md`  
**Parent spec:** `docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md`  
**Branch:** `feat/dpdp-readiness-phase-b` (stacked from Phase A HEAD `0334b5f`; rebase onto `main` after PR #104 merges)  
**Skill:** writing-plans  
**Rule:** tests first at every task; RED before GREEN is recorded; full gates run before every commit; no push/PR/merge/deploy/infra change without explicit approval.

## Context for the engineer

Phase A already delivered the verdict enum, `control_results` table, the pure control evaluator, version-dispatched scoring, and the readiness UI. Phase B adds **only foundation**: v2 contract schemas, a structurally complete but content-light `dpdpa-2026.11.0` pack, a validator, additive DB columns/table, and version constants. It must not change scoring, evaluator behavior, legacy scans, or rendered UI. The exit gate is: validator rejects orphan/missing rules, v1 pack still loads, additive migrations validate, full gates green.

Critical repository facts:

- `packages/contracts/src/readiness.ts` already exports `READINESS_VERDICTS`, `FINDING_KINDS`, `DETECTOR_STATUSES`, `evidenceReferenceSchema`, `controlResultSchema`, `assessmentSummarySchema`. Reuse them; do not redefine.
- `CONTROL_CODE_PATTERN` lives in `packages/contracts/src/fingerprint.ts`: `/^DPDPA-[0-9]+(?:\.[0-9]+)?-[A-Z0-9]+-[0-9]+$/`.
- `packages/contracts` has `vitest`, `yaml`, `zod` already; tests import from `../src/...`.
- `apps/orchestrator/src/modules/rule-pack/rule-pack.loader.ts` recursively lists every `*.yaml` under the pack directory and rejects files absent from the v1 manifest. A new `v2/` subdirectory will break v1 loading unless explicitly excluded (Task 2).
- `apps/orchestrator/test/rule-pack.loader.test.ts` already loads the shipped `dpdpa-2026.10.6` pack (19 controls, 50 mappings, `scoringVersion: '1.0.0'`). Keep it green.
- Prisma migrations follow `apps/orchestrator/prisma/migrations/<timestamp>_<name>/migration.sql`; RLS policies use `current_setting('app.current_org', true)::uuid`; `set_updated_at()` already exists.
- Turbo `build.dependsOn: ["^build"]`, `test.dependsOn: ["build"]`. A `build` script on `@dpdpa/rule-packs` makes its tests wait for `@dpdpa/contracts` dist.
- Full gates: `pnpm lint && pnpm typecheck && pnpm test`. Run at each task boundary before committing.
- Fixtures are test inputs only. Never use pilot data. Never inject canary into real source. Rotate away from `acme-payments`.

## Task 1 — v2 contracts and version constants

**Files:** `packages/contracts/src/pack-v2.ts` (new), `packages/contracts/src/index.ts` (export), `packages/contracts/test/pack-v2.test.ts` (new).

### Step 1.1 — RED tests first

Create `packages/contracts/test/pack-v2.test.ts`. It must:

1. Assert `DPDPA_PACK_V2_VERSION === 'dpdpa-2026.11.0'` and `INVENTORY_V1_VERSION === 'inventory-1.0.0'`.
2. Parse a valid v2 control with `code: 'DPDPA-8.4-SECRET-01'`, `section: '8(4)'`, `actRef: 'DPDPA Section 8(4)'`, one `legalRefs` entry, `evidenceMode: 'manual'`, empty rule arrays, `partialCredit: false`, `remediationKey: 'remove-hardcoded-secrets'`. Expect success.
3. Reject `code: 'DP-6-01'` (draft-style ID).
4. Reject a control with `evidenceMode: 'violation'` and all rule arrays empty (no evidence rule).
5. Reject `legalRefs: []` and a `legalRef` of `'see act'`.
6. Parse a valid `inventorySignalSchema` with only `detector`, `kind`, `path`, `line`, `token`, `count`; reject one carrying `value`, `snippet`, `context`, or `match` (strict schema).
7. Parse a valid `detectorV2Schema` with `failureMode: 'UNKNOWN'`, `timeoutMs: 30000`, and `controlRefs: []`.
8. Parse a valid `attestationSchema` with boolean `answer: false` and `expiresAt: null`; reject `expiresAt: 'not-a-date'`.
9. Call `validatePackV2({ files, manifest })` with:
   - one valid control + one valid detector + valid manifest → `[]`;
   - duplicate control code → issue `code: 'duplicate_control'`;
   - control rule referencing an undeclared detector → `code: 'orphan_detector'`;
   - checksum drift for one file → `code: 'checksum_mismatch'`;
   - a commencement entry with `effectiveFrom: '15-11-2026'` → `code: 'invalid_commencement'`;
   - a file value containing a `snippet` key anywhere → `code: 'source_content_field'`.
10. Add an export test in `packages/contracts/test/index.test.ts` (or a new assertion) that all new names are exported from `../src/index`.

Run RED:

```bash
pnpm --filter @dpdpa/contracts test -- pack-v2.test.ts
```

Expected RED: module `../src/pack-v2` cannot be resolved / named exports missing. Record the exact failure summary in `.superpowers/sdd/2026-11-27-dpdp-evidence-backed-readiness-phase-a/progress.md`.

### Step 1.2 — GREEN implementation

Create `packages/contracts/src/pack-v2.ts` with:

```ts
import { z } from 'zod';
import { CONTROL_CODE_PATTERN } from './fingerprint';
import { readinessConfidenceSchema } from './readiness';

export const DPDPA_PACK_V2_VERSION = 'dpdpa-2026.11.0';
export const INVENTORY_V1_VERSION = 'inventory-1.0.0';

export const SECTION_REF_PATTERN = /^\d+(?:\(\d+\))?$/;
export const LEGAL_REF_PATTERN =
  /^(?:DPDPA Section \d+(?:\(\d+\))?(?:\([a-z]\))?|DPDP Rules \d+(?:\([a-z]\))?)$/;
export const DETECTOR_ID_PATTERN = /^[a-z][a-z0-9_]{2,48}$/;
export const TOKEN_PATTERN = /^[A-Za-z0-9_.:/-]{1,120}$/;
export const RELATIVE_PATH_PATTERN = /^(?!\/)(?!.*\.\.)[^\0]{1,240}$/;
```

Define and export these strict schemas:

- `inventorySignalSchema`: `{ detector: detectorId, kind: enum(['file','symbol','field','route','dependency','config','artefact','region','cookie','header']), path: relativePath, line: int.positive().max(100000).nullable(), token: token, count: int.nonnegative().max(100000).nullable().optional() }`.
- `inventoryFactSchema`: `{ key: enum of the 12 inventory module keys, signals: array(max 2000), detectedAt: ISO datetime }`.
- `ruleProvenanceSchema`: `{ search: string(max 200), token: token.optional(), pathHint: relativePath.optional() }`.
- `violationRuleSchema`, `absenceRuleSchema`, `positiveRuleSchema`: each `{ id, detector, ... , confidence }` with `id` matching `[a-z0-9_.-]{1,64}` and bounded arrays (max 32).
- `controlV2Schema`: as described in the RED tests; `evidenceMode` is `z.enum(['absence','positive','violation','manual','attestation'])`; `appliesWhen` is an array(max 32) of strict `{ language?, stack? }`; `legalRefs` is array(min 1, max 8) of `LEGAL_REF_PATTERN`.
- `detectorV2Schema`: `{ id, module, inputs: array(min 1, max 8) of enum(['source','dependencies','config','artefacts','headers','runtime']), outputs: array(min 1, max 8) of enum(['fact','signal','finding','status']), timeoutMs: int(100..120000), stacks: array(max 32) of token, confidence, failureMode: enum(['UNKNOWN','FAIL_CLOSED']), controlRefs: array(max 64) of CONTROL_CODE_PATTERN }`.
- `attestationSchema`: `{ orgId: uuid, repositoryId: uuid, key: pattern, answer: boolean, note: string(max 2000).nullable().optional(), attestedBy: uuid, attestedAt: ISO datetime, expiresAt: ISO datetime.nullable().optional() }`.
- `packManifestV2Schema`: `{ version: literal(1), pack: literal(DPDPA_PACK_V2_VERSION), generatedAt: ISO datetime, files: array(min 1, max 200) of strict `{ path: pattern, sha256: /^[0-9a-f]{64}$/ }` }`.
- `commencementEntrySchema` / `commencementFileSchema`: entry `{ provision: LEGAL_REF_PATTERN, effectiveFrom: /^\d{4}-\d{2}-\d{2}$/, sourceUrl: https URL, verifiedOn: same date }`; file `{ version: literal(1), pack: literal(v2), entries: array(min 1, max 32) }`.
- `catalogFileSchema`: `{ version: literal(1), pack: literal(v2), entries: array(max 500) of strict `{ key: token, label: string(max 200) }` }`.
- `mappingsFileV2Schema`: `{ version: literal(1), pack: literal(v2), mappings: array(max 500) of strict `{ detector: detectorId, control: CONTROL_CODE_PATTERN, confidence, rationale: string(max 300) }` }`.

Export `ValidationIssue`:

```ts
export interface ValidationIssue {
  path: string;
  code: string;
  message: string;
}
```

Export pure `validatePackV2(input: { files: Array<{ path: string; value: unknown; sha256: string }>; manifest: unknown }): ValidationIssue[]` that:

1. Parses `manifest` with `packManifestV2Schema`; on failure push one `invalid_manifest` issue and return (no cross-checks on an untrusted manifest).
2. Builds a map from manifest file path → sha256. For each supplied file whose path is not listed → `unknown_file`; for each manifest entry with no supplied file → `missing_file`; for each supplied file whose `sha256` differs → `checksum_mismatch`.
3. Selects a schema by path: `controls.yaml` → `{ version: literal(1), pack: literal(v2), effectiveFrom: date, controls: array(max 200) of controlV2Schema }`; `detectors.yaml` → `{ version, pack, detectors: array(max 200) of detectorV2Schema }`; `commencement.yaml` → `commencementFileSchema`; `mappings/*.yaml` → `mappingsFileV2Schema`; other `*.yaml` → `catalogFileSchema`; `manifest.yaml` is excluded by the caller. Unknown extension → `unknown_file`. On parse failure push `invalid_schema` with the Zod issue path and message (never the offending value).
4. Recursively walks every supplied value's own keys; if any key is one of `snippet`, `value`, `content`, `context`, `raw`, `match`, push `source_content_field` with the file path and key only.
5. Collects controls and detectors from successfully parsed docs. Duplicate `control.code` → `duplicate_control`. Any detector ID referenced by a control rule (violation/absence/positive) or mapping that is absent from `detectors.yaml` → `orphan_detector`. Any control with `evidenceMode` not in `['manual','attestation']` and all three rule arrays empty → `missing_rule`. Any control with `legalRefs` empty → `missing_legal_ref`.
6. For `commencement.yaml`, additionally `new Date(entry.effectiveFrom)` must be valid → otherwise `invalid_commencement`.
7. Returns issues in deterministic order: file path ascending, then code ascending, then message ascending.

Add `export * from './pack-v2';` to `packages/contracts/src/index.ts`.

Run GREEN:

```bash
pnpm --filter @dpdpa/contracts test -- pack-v2.test.ts
pnpm lint && pnpm typecheck && pnpm test
```

Expected: GREEN; full gates 10/10 turbo tasks. Commit:

```bash
git add packages/contracts && git commit -m "feat(contracts): add Phase B pack v2 schemas and validator"
```

### Step 1.3 — ledger

Record RED failure counts and GREEN counts in the local progress ledger. Do not force-add `.superpowers/` (it is gitignored).

## Task 2 — isolate v1 pack loader from the v2 directory

**Files:** `apps/orchestrator/src/modules/rule-pack/rule-pack.loader.ts`, `apps/orchestrator/test/rule-pack.loader.test.ts`.

### Step 2.1 — RED

Add to `rule-pack.loader.test.ts` inside `describe('loadRulePack (P4-01, P4-02)')`:

```ts
it('ignores a sibling v2 pack directory when loading v1', async () => {
  const dir = await copyPack();
  await mkdir(join(dir, 'v2'), { recursive: true });
  await writeFile(join(dir, 'v2', 'controls.yaml'), 'version: 1\npack: dpdpa-2026.11.0\n');
  const pack = await loadRulePack(dir);
  expect(pack.pack).toBe(PACK);
  expect(pack.controls).toHaveLength(19);
});
```

Import `mkdir` from `node:fs/promises`. Run RED:

```bash
pnpm --filter @dpdpa/orchestrator test -- rule-pack.loader.test.ts
```

Expected RED: rejects with `RulePackError` / `RULE_PACK_UNKNOWN_FILE: files not covered by the manifest: v2/controls.yaml`.

### Step 2.2 — GREEN

In `listYaml`, skip the top-level `v2` directory:

```ts
for (const entry of entries) {
  if (entry.isDirectory() && base === dir && entry.name === 'v2') continue;
  ...
}
```

Keep the change minimal; no other loader behavior changes. Run GREEN and full gates, then commit:

```bash
git add apps/orchestrator/src/modules/rule-pack/rule-pack.loader.ts apps/orchestrator/test/rule-pack.loader.test.ts
git commit -m "fix(rule-pack): keep v1 loader isolated from v2 pack directory"
```

## Task 3 — v2 rule pack files and deterministic manifest

**Files:** `packages/rule-packs/v2/**` (new), `packages/rule-packs/scripts/generate-manifest-v2.mjs` (new), `packages/rule-packs/test/pack-v2-files.test.mjs` (new), `packages/rule-packs/package.json`.

### Step 3.1 — RED

Add `packages/rule-packs/test/pack-v2-files.test.mjs` using `node:test` and `node:assert/strict`. It must assert:

- every file listed by `getPackFiles()` exists and has a matching sha256 entry in `v2/manifest.yaml`;
- `v2/controls.yaml` has `pack: dpdpa-2026.11.0`;
- the v2 tree contains at least the required paths: `controls.yaml`, `detectors.yaml`, `mappings/inventory.yaml`, `commencement.yaml`, `penalties.yaml`, `india-regions.yaml`, `sdk_catalog.yaml`, `field_dictionary.yaml`, `mechanism_catalog.yaml`, `cmp_catalog.yaml`, `cookie_catalog.yaml`, `security_headers.yaml`, `ecosystem_patterns/web.yaml`, `templates/README.md`, `manifest.yaml`;
- `generateManifestV2()` produces identical `files` entries on two consecutive calls (compare `files` only; `generatedAt` is metadata).

Run RED:

```bash
pnpm --filter @dpdpa/rule-packs test
```

Expected RED: `ENOENT` for `v2/manifest.yaml`. Record it.

### Step 3.2 — GREEN

Create `packages/rule-packs/v2/` with the files above. Content rules:

- Every YAML catalogue file starts with `version: 1`, `pack: dpdpa-2026.11.0`, and `entries: []` except `commencement.yaml`.
- `commencement.yaml` has three entries using official URLs from the parent spec references and `verifiedOn: '2026-11-26'`; `effectiveFrom` uses ISO `YYYY-MM-DD`.
- `controls.yaml` contains exactly one exemplar control (the shape from Task 1 RED step 2) with `evidenceMode: manual`, empty rule arrays, and full legal refs. Add a comment that substantive controls arrive in Phase C/D.
- `detectors.yaml` declares `schema_scan` and `form_scan` with full valid fields, `controlRefs: []`.
- `mappings/inventory.yaml` has `mappings: []`.
- `templates/README.md` explains placeholders are filled in Phase D and contains no source-shaped content.

Create `packages/rule-packs/scripts/generate-manifest-v2.mjs` as a sibling of the v1 generator:

```js
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'v2');
// recursively list all files except manifest.yaml, sorted by POSIX path
// sha256 = createHash('sha256').update(bytes).digest('hex')
// write version: 1, pack: dpdpa-2026.11.0, generatedAt: new Date().toISOString(), files: [...]
```

Run it once to create `v2/manifest.yaml`.

Update `packages/rule-packs/package.json`:

```json
"scripts": {
  "build": "node scripts/validate-v2-pack.mjs --quiet",
  "test": "node --test test/*.test.mjs",
  "manifest": "node scripts/generate-manifest.mjs",
  "manifest:v2": "node scripts/generate-manifest-v2.mjs",
  "validate": "node scripts/validate-v2-pack.mjs"
},
"dependencies": {
  "@dpdpa/contracts": "workspace:*",
  "yaml": "2.9.1"
}
```

`validate-v2-pack.mjs` is created in Task 4; until then do not run `pnpm lint`/`pnpm typecheck`/`pnpm test` at this boundary — combine Task 3 GREEN with Task 4 GREEN before the full gate. Run `pnpm install` now to update `pnpm-lock.yaml` for the new importer deps. Verify no unintended lockfile churn.

Run focused GREEN:

```bash
pnpm --filter @dpdpa/rule-packs test
```

## Task 4 — v2 pack validator CLI and negative tests

**Files:** `packages/rule-packs/scripts/validate-v2-pack.mjs` (new), `packages/rule-packs/test/validate-v2-pack.test.mjs` (new).

### Step 4.1 — RED

Add `validate-v2-pack.test.mjs` using `node:test`. It copies `v2/` into a temp dir via `fs.cp` and mutates copies. For each case, spawn `node scripts/validate-v2-pack.mjs <dir>` with `execFile` and assert exit code and a structured JSON issue payload containing the expected `code`:

1. unmodified pack → exit 0, `issues: []`;
2. append a second control with a duplicate `code` → exit 1, `duplicate_control`;
3. point the exemplar control's `absenceRules` at detector `ghost_detector` and switch `evidenceMode` to `absence` → exit 1, `orphan_detector`;
4. switch `evidenceMode` to `violation` with no rules → exit 1, `missing_rule`;
5. set `legalRefs: []` → exit 1, `missing_legal_ref`;
6. set `commencement.entries[0].effectiveFrom` to `15-11-2026` → exit 1, `invalid_commencement`;
7. insert `snippet: 'CANARY_LOCAL_FIXTURE'` into a signal-like object in `mappings/inventory.yaml` → exit 1, `source_content_field`, and assert stdout/stderr do NOT contain `CANARY_LOCAL_FIXTURE` (only the key name may appear);
8. change one byte in a manifest-hashed file → exit 1, `checksum_mismatch`.

Also add `it('keeps the shipped v1 pack loadable')` which runs the orchestrator loader test path indirectly by spawning `pnpm --filter @dpdpa/orchestrator test -- rule-pack.loader.test.ts` — **or** keep the v1 regression in Task 2 and skip the spawn to avoid slow tests; prefer keeping it in Task 2 and adding a comment here.

Run RED:

```bash
pnpm --filter @dpdpa/rule-packs test
```

Expected RED: CLI file missing → `ENOENT` for every case. Record it.

### Step 4.2 — GREEN

Create `scripts/validate-v2-pack.mjs`:

- Parse `process.argv[2]` as pack dir, default to `<root>/v2`.
- Recursively read every file except `manifest.yaml`; parse YAML with `yaml.parse`; compute sha256 over raw bytes.
- Import `validatePackV2` and `packManifestV2Schema` from `@dpdpa/contracts`.
- Call `validatePackV2({ files, manifest: parse(rawManifest) })`.
- Print exactly one JSON line: `{"pack":"dpdpa-2026.11.0","issues":[{"path","code","message"}...]}` to stdout. Never print file contents or matched values. On unexpected I/O errors, print `{"pack":...,"issues":[{"path":"<root>","code":"io_error","message":"..."}]}` with a generic message and exit 1.
- Exit 0 if `issues.length === 0`, else 1. Support `--quiet`: print nothing, still enforce exit code.
- Wrap the CLI body in `try/catch` so failures always produce the structured JSON contract.

Run GREEN:

```bash
pnpm --filter @dpdpa/rule-packs test
pnpm lint && pnpm typecheck && pnpm test
```

Expected: rule-packs 2 files / ~12 tests; full gates green. Commit:

```bash
git add packages/rule-packs
git commit -m "feat(rule-packs): add checksummed v2 pack foundation and validator"
```

## Task 5 — additive Prisma schema and migration

**Files:** `apps/orchestrator/prisma/schema.prisma`, `apps/orchestrator/prisma/migrations/20261127010000_readiness_phase_b/migration.sql` (new), `apps/orchestrator/test/phase-b-schema.test.ts` (new).

### Step 5.1 — RED

Add a test that reads `schema.prisma` as text and asserts:

- `Scan` contains `inventoryVersion`, `inventoryStatus`, `consentGatingRatio` with the expected `@map` values;
- an `Attestation` model exists with `orgId`, `repositoryId`, `key`, `answer Boolean`, `note`, `attestedBy`, `attestedAt`, `expiresAt`, and `@@unique([orgId, repositoryId, key])`;
- the migration SQL contains `ALTER TABLE scans`, `CREATE TABLE attestations`, `ENABLE ROW LEVEL SECURITY`, and a tenant policy;
- the migration SQL does **not** contain `DROP`, `TRUNCATE`, `UPDATE scans`, or `DELETE FROM`.

Run RED:

```bash
pnpm --filter @dpdpa/orchestrator test -- phase-b-schema.test.ts
```

Expected RED: match counts 0. Record it.

### Step 5.2 — GREEN

Update `Scan`:

```prisma
inventoryVersion     String?   @map("inventory_version") @db.Text
inventoryStatus      String?   @map("inventory_status") @db.Text
consentGatingRatio   Decimal?  @map("consent_gating_ratio") @db.Decimal(5, 4)
```

Add `Attestation` model after `ControlResult`, mirroring `ControlResult`'s org/repo relations, timestamps, RLS, and indexes:

```prisma
model Attestation {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  orgId        String    @map("org_id") @db.Uuid
  repositoryId String    @map("repository_id") @db.Uuid
  key          String    @db.Text
  answer       Boolean
  note         String?   @db.Text
  attestedBy   String    @map("attested_by") @db.Uuid
  attestedAt   DateTime  @default(now()) @map("attested_at") @db.Timestamptz
  expiresAt    DateTime? @map("expires_at") @db.Timestamptz
  createdAt    DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime  @default(now()) @map("updated_at") @db.Timestamptz

  organization Organization @relation(fields: [orgId], references: [id], onDelete: Cascade)
  repository   Repository   @relation(fields: [repositoryId], references: [id], onDelete: Cascade)
  attester     User         @relation("AttestationAttester", fields: [attestedBy], references: [id], onDelete: Restrict)

  @@unique([orgId, repositoryId, key])
  @@index([orgId, repositoryId])
  @@index([expiresAt])
  @@map("attestations")
}
```

Add matching back-relations on `Organization`, `Repository`, and `User` (named `AttestationAttester` on User). Keep all existing relations untouched.

Write migration SQL using `mapping_confidence`-style conventions already in the repo: nullable `text` columns, `numeric(5,4)` ratio, `boolean` answer, `uuid` FKs to `organizations`, `repositories`, `users`, `set_updated_at()` trigger, RLS policy `tenant_isolation_attestations`, and indexes. No backfill.

Run GREEN:

```bash
pnpm --filter @dpdpa/orchestrator exec prisma validate
pnpm --filter @dpdpa/orchestrator test -- phase-b-schema.test.ts
pnpm lint && pnpm typecheck && pnpm test
```

Expected: all green; Prisma validation passes. Commit:

```bash
git add apps/orchestrator/prisma apps/orchestrator/test/phase-b-schema.test.ts
git commit -m "feat(db): add Phase B inventory and attestation storage shape"
```

## Task 6 — Phase B exit gate, final gates, and review

**Files:** `apps/orchestrator/test/phase-b-exit-gate.test.ts` (new), plan/progress docs.

### Step 6.1 — RED exit-gate test

Add a focused test that asserts, from the filesystem and CLI:

- `validatePackV2` against the shipped v2 pack returns `[]`;
- mutating a control's `evidenceMode` to `violation` with no rules produces `missing_rule`;
- adding an undeclared detector reference produces `orphan_detector`;
- the v1 loader still loads `packages/rule-packs` with `pack === 'dpdpa-2026.10.6'` and `scoringVersion === '1.0.0'`;
- the v1 `scoring.yaml` file's sha256 still matches its manifest entry (legacy scoring untouched).

Run RED (it should pass only once Tasks 1–5 are green; if run early it fails and that is the RED evidence). Then run GREEN.

### Step 6.2 — full gates and evidence

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @dpdpa/rule-packs test
pnpm --filter @dpdpa/orchestrator test -- rule-pack.loader.test.ts phase-b-exit-gate.test.ts phase-b-schema.test.ts
git diff --check
```

Record exact counts. Note: full-gate logs contain intentional error-path fixtures; they are not failures.

### Step 6.3 — review and commit

- Dispatch a fresh-context general subagent to review only `d83d55d..HEAD` Phase B diffs for Required defects (schema containment, legacy isolation, migration additive-only, deterministic manifest). Do not let it modify files.
- Fix any Required finding with RED/GREEN, rerun gates.
- Update plan checkboxes truthfully and commit:

```bash
git add docs/superpowers/plans/2026-11-27-dpdp-evidence-backed-readiness-phase-b.md
git commit -m "docs(plan): record Phase B completion evidence"
```

- Report branch, commits, gate output, and manual smoke IDs (none for this phase). Ask explicit approval before push/PR, rebase onto `main`, merge, deploy, image-pin changes, or `infra/` changes.

## Definition of done

- [x] All Tasks 1–6 GREEN with RED evidence recorded in `.superpowers/sdd/2026-11-27-dpdp-evidence-backed-readiness-phase-a/progress.md`.
- [x] `pnpm lint && pnpm typecheck && pnpm test` green: lint clean (`eslint`, `prettier --check`, token lint); typecheck 11/11 turbo tasks; test 12/12 turbo tasks with web 74 files/548 tests. Focused: rule-packs 13/13; orchestrator `rule-pack.loader`, `phase-b-exit-gate`, `phase-b-schema` 3 files/22 tests; `git diff --check` clean.
- [x] Validator rejects duplicate control, orphan detector, missing rule, missing legal ref, invalid commencement, checksum drift, and source-content fields; exit gate additionally verifies shipped pack and CLI accept the v2 pack with zero issues.
- [x] v1 pack loads with 19 controls and `scoringVersion: '1.0.0'` alongside a top-level `v2/` directory; `dpdpa-2026.10.6` scoring.yaml checksum still matches its manifest entry.
- [x] Migrations additive, RLS-enabled, Prisma-valid (`prisma validate` reports the schema valid).
- [x] No forbidden rendered wording, no source/canary retention, no pilot data used (case-insensitive grep of new pack and migration finds no forbidden terms; canaries never appear in validator output).
- [x] Fresh-context review (`ses_de3aba89dffeSpDqpv9oM8swsA`) found no Required defects. Two low-risk observations were fixed with RED/GREEN: raw control identifiers are no longer echoed in `missing_legal_ref` issues, and the attestation RLS policy uses the established `NULLIF(current_setting(...), '')::uuid` form.
- [x] No push/PR/merge/deploy/infra change without explicit approval.

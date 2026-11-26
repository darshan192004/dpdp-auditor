# Rule pack changelog

## 2026.10.4 — 2026-11-26

- Patch bump for advisory Semgrep exclusion hardening only; controls, weights,
  and the scoring formula are unchanged. Historical scans are never re-scored.
- JS lawful-basis and breach-alert exclusions now ignore braces inside strings
  and comments and span assigned handlers and arrow callbacks, so quoted `}` and
  `window.onerror` / `security_event(() => ...)` forms no longer produce false
  positives that can fail the mapped scored controls.
- `tests/semgrep/dpdpa.handlers.js` covers both forms with and without a marker
  or notification hook.

## 2026.10.3 — 2026-11-26

- Patch bump for advisory Semgrep rule exclusions only; controls, weights, and
  the scoring formula are unchanged. Historical scans are never re-scored.
- Scoped the three Semgrep rule exclusions to the processing operation, exception
  handler, and Markdown document respectively, so an unrelated marker elsewhere
  in a file no longer suppresses a finding.
- `tests/semgrep/check.py` verifies the scoping cases in CI.

## 2026.10.2 — 2026-11-25

- Minor pack bump for new mappings only; control definitions, weights, and the
  scoring formula are unchanged. Historical scans are never re-scored.
- Added the 14 Checkov rule IDs that the runner already emitted but the pinned
  catalog did not review (`CKV2_GHA_1`, `CKV_DOCKER_2/3/7`,
  `CKV_OPENAPI_1/4/5/6/7/16/17/18/21`, `CKV_SECRET_4`). They now map to access
  control, transport encryption, minimisation, monitoring, and secret controls,
  so whole-repository scans no longer drop real findings as unmapped.
- Added three advisory Semgrep rules so every scored control can fail:
  `dpdpa.generic.lawful-basis-missing` (§7),
  `dpdpa.generic.breach-alert-missing` (§8(5)), and
  `dpdpa.generic.sdf-artifacts-missing` (§10). DPDPA §8(4) transport encryption
  is now evidenced by the mapped `CKV_OPENAPI_7` and `CKV_OPENAPI_18` rules.
- Section scores include unassessed sections as `null`, and reports label
  unmapped findings explicitly instead of showing `-`.

## 2026.10.1 — 2026-11-12

- Initial pack: 19 controls from `docs/rules.md` §4, 33 scanner mappings
  (Checkov 13, Semgrep 12, Gitleaks 8), scoring config v1.0.0.
- No suppressions are shipped; secret findings require a hash-scoped
  suppression with a written reason and expiry.
- `scanner-catalog.json` pins the scanner rule IDs the pack may map (Semgrep
  1.95.0, Checkov 3.2.0, Gitleaks 8.21.0). CI rejects a mapping that references
  an uncatalogued rule, and `mapping_miss_total` tracks drift at runtime.

Packs are immutable once published. A change requires a version bump per
`docs/rules.md` §12.2 and regenerating `manifest.yaml`.

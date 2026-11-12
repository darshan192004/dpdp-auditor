# Rule pack changelog

## 2026.10.1 — 2026-11-12

- Initial pack: 19 controls from `docs/rules.md` §4, 33 scanner mappings
  (Checkov 13, Semgrep 12, Gitleaks 8), scoring config v1.0.0.
- No suppressions are shipped; secret findings require a hash-scoped
  suppression with a written reason and expiry.

Packs are immutable once published. A change requires a version bump per
`docs/rules.md` §12.2 and regenerating `manifest.yaml`.

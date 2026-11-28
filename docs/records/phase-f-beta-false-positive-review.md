# Phase F beta false-positive review

Status: pending_explicit_approval
Default display: disabled
Target: ≤10% false positives on direct-confidence controls across 5–10 approved beta repositories before default display is enabled.

No beta repositories have been reviewed. Live scans and pilot sign-off require explicit user approval. Fixtures under `tests/golden-repos/` are test inputs only and must never be used as pilot evidence or sign-off data.

`phase-f-beta-false-positive-review.json` is the machine-readable gate input. `evaluateBetaGate` returns `allowed: true` only when the record is `approved`, contains 5–10 repositories, has at least one direct-confidence control, and the false-positive rate is ≤0.10. Default display stays disabled until that condition is met and the user explicitly approves display.

This record makes no pilot sign-off claim and does not authorize a live scan.

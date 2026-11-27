# ADR 0001: Evidence-backed DPDPA readiness assessment

**Date:** 2026-11-26
**Status:** Accepted
**Accepted on:** 2026-11-27
**Related design:** `docs/superpowers/specs/2026-11-26-dpdp-evidence-backed-readiness-design.md`

## Context

The current scoring engine treats an applicable control with zero findings as fully compliant. A real WebGoat probe produced a hardcoded-key finding yet still scored `90/A`, proving that “no configured rule fired” is being presented as a positive result. The scanner output itself was real; the semantics of scoring were wrong.

The product operates in an internal-only pilot, stores no source code, scans public GitHub repositories anonymously, and must never produce legal conclusions. The draft DPDPA assessment spec proposed a much larger system with several internal contradictions around verdicts, confidence weight, section numbering, and attestation scoring.

## Decision

Move to a readiness-only, evidence-backed assessment:

1. Replace implicit pass-by-absence with a canonical verdict set and an explicit, pure `ControlEvaluator`.
2. Persist `control_results` per control per scan with evidence references, detector status, rule-pack version, and scoring version.
3. Add scoring v2 where `UNKNOWN` is excluded, `PASS` requires positive evidence, and evidence coverage caps grades.
4. Keep legacy scans on `scoring-1.x` with a visible legacy label; never rewrite historical results.
5. Add an in-pod inventory analyzer that emits facts, signals, and detector status only — never file contents or secret values.
6. Deliver the full A–F program as phase-gated PRs, with no push, deploy, image pin change, or merge without explicit approval.
7. Keep Phase G live URL verification out of scope pending a separate threat-model review.

## Alternatives considered

- **Keep current scoring and add more rules.** Rejected: it preserves the false-pass semantics and cannot express “could not determine”.
- **Capability slices instead of phase-gated PRs.** Rejected: faster demos but cross-cutting churn and higher risk of inconsistent semantics.
- **Parallel feature-flagged rewrite.** Rejected: longest dual-path period and highest merge-conflict risk.
- **Public compliance verdict after legal review.** Rejected: conflicts with the readiness-only position and the existing disclaimer model.

## Consequences

- Existing scans and reports remain stable and clearly marked as legacy.
- New scans can produce a lower score with better information; a drop in score is expected and correct.
- More code, contracts, migrations, rule-pack validation, tests, and UI/report work is required across several PRs.
- Legal wording, commencement dates, penalties, and control references require counsel review before release.
- Fixtures are test inputs only and must never be used as pilot evidence or sign-off data.

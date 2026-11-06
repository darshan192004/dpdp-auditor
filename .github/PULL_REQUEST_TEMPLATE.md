# Pull request

## What changed

<!-- Link the task/issue and summarise the change in 1–3 sentences. -->

## Why

<!-- Problem, evidence, or requirement. Scoring/rule-mapping changes need a rule-pack version bump and a legal note (code_style.md §10.7). -->

## How verified

<!-- Commands run and their results, including coverage. -->

## Checklist

- [ ] Tests added or updated, and failing before the fix where applicable
- [ ] Lint, typecheck, and tests pass locally (`pnpm lint && pnpm typecheck && pnpm test:coverage`)
- [ ] No new `any`, `@ts-ignore`, or disabled lint rule without a reason
- [ ] Security implications reviewed (input, auth, logging, secrets)
- [ ] Observability added for new failure modes
- [ ] Docs updated (specs, ADRs, changelog) where behaviour changed

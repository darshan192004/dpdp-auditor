# Frontend verification evidence

All screenshots are captured with Playwright against `pnpm dev` with `NUXT_PUBLIC_NEW_UI=1`.

| Screen | URL | Checks | Screenshot | Console errors | Result |
|---|---|---|---|---|---|
| New shell | `http://localhost:3000/app` | `header nav[aria-label="Breadcrumb"]` visible = "Overview"; `main#main` visible; `main h1` = "Overview"; 7 primary nav links | `rebuild-shell.png` | none | PASS (visible Chromium) |
| Overview | `http://localhost:3000/app` | shell breadcrumb visible; `main h1` = "Overview" | `rebuild-overview.png` | none | PASS |
| Scans list | `http://localhost:3000/app/scans` | `main h1` = "Scans"; repository + score/status render together | `rebuild-scans.png` | none | PASS |
| Scan detail | `http://localhost:3000/app/scans/0f000000-0000-4000-8000-000000000010` | `main` contains "coverage:" and "Score and coverage breakdown" | `rebuild-scan-detail.png` | none | PASS |
| Reduced motion | `http://localhost:3000/app` | `prefers-reduced-motion: reduce` → computed transition `1e-05s` | n/a | none | PASS |
| Findings | `http://localhost:3000/app/scans/0f000000-0000-4000-8000-000000000010/findings` | `main h1` = "Findings"; severity chips + evidence rows render; clicking a row opens `role="dialog"` with evidence hash, remediation summary and "Open remediation workspace" link | `rebuild-findings.png` | none | PASS (visible Chromium) |
| Remediation workspace (real PATCH) | `http://localhost:3000/app/scans/0f000000-0000-4000-8000-000000000010/remediation` | `main h1` = "Remediation workspace"; drawer opens; `select` → `false_positive` + triage note; Save disposition issues real `PATCH /api/v1/findings/:id` → success toast `0f000000-0000-4000-8000-000000000101 → false_positive`, drawer closes | `rebuild-remediation.png` | none | PASS (visible Chromium) |
| Remediation index | `http://localhost:3000/app/remediation` | `main h1` = "Remediation"; axe sweep clean | n/a | none | PASS |

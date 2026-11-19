# Frontend verification evidence

Flag-free Signal Console walkthrough, captured with Playwright MCP against `pnpm dev` on
`http://localhost:3000` with `NUXT_FIXTURES='1'`, `ORCHESTRATOR_URL=''`, and **no**
`NUXT_PUBLIC_NEW_UI` variable. The feature flag and its legacy branches have been removed from
the source; everything below renders the rebuilt UI directly.

Visible browser checks: every route below was opened in the connected Playwright MCP Chromium
session, its `h1`/body copy asserted with live locators, and a viewport screenshot saved under
`.playwright-mcp/walkthrough-*.png`. Across the whole session the console reported
**0 errors / 75 warnings** (184 messages total); the warnings are the known Nuxt/Vue dev-only
`NUXT_E4007`, duplicate `requireIdentity` import, and non-element `<Transition>` root notices.

| Screen | URL | Checks | Screenshot | Console errors | Result |
|---|---|---|---|---|---|
| Landing | `/` | visible `h1` "DPDPA GitHub Code Auditor" | `walkthrough-landing.png` | none | PASS |
| Overview | `/app` | `main h1` = "Overview"; "Scored controls", "Not yet scored", "Sections covered", "Scanner mappings"; breadcrumb "Overview" | `walkthrough-overview.png` | none | PASS |
| Scans list | `/app/scans` | `main h1` = "Scans"; full `82.6`, partial `74.1`, `scanning` render together | `walkthrough-scans.png` | none | PASS |
| Scan detail | `/app/scans/0f000000-0000-4000-8000-000000000010` | `main h1` = "acme/payments-service"; `82.6`, `coverage: full`, grade `B`, "Score and coverage breakdown" | `walkthrough-scan-detail.png` | none | PASS |
| Score/Coverage drill-down | `/app/scans/0f000000-0000-4000-8000-000000000010/coverage` | `main h1` = "Score and coverage"; "Section scores" | `walkthrough-coverage.png` | none | PASS |
| Findings | `/app/scans/0f000000-0000-4000-8000-000000000010/findings` | `main h1` = "Findings"; 14 evidence rows (`sha256:`); critical filter narrows to 3 with `aria-pressed=true`; row click opens dialog containing "Personal data is written to application logs." and `sha256:`; drawer link opens the remediation workspace with `?finding=` | `walkthrough-findings.png`, `walkthrough-remediation-open.png` | none | PASS |
| Remediation workspace | `/app/scans/0f000000-0000-4000-8000-000000000010/remediation` | `main h1` = "Remediation workspace"; 14 triage rows; drawer opens; `Status` select → `false_positive`; triage note set; **real `PATCH /api/v1/findings/0f000000-0000-4000-8000-000000000101` returned 200**; success toast names the finding and status; drawer closes | `walkthrough-remediation-saved.png` | none | PASS |
| Remediation index | `/app/remediation` | `main h1` = "Remediation" | `walkthrough-remediation-index.png` | none | PASS |
| Rules | `/app/rules` | `main h1` = "Rules"; `Personal data is encrypted at rest`, `DPDPA-8.4-ENC-01` | `walkthrough-rules.png` | none | PASS |
| Rule detail | `/app/rules/DPDPA-12-ACCESS-01` | `main h1` = "Data access and export endpoint exists" | `walkthrough-rule-detail.png` | none | PASS |
| Audit | `/app/audit` | `main h1` = "Audit"; `finding.triaged`, `org.created` | `walkthrough-audit.png` | none | PASS |
| Repositories | `/app/repos` | `main h1` = "Repositories"; `acme/payments-service` | `walkthrough-repos.png` | none | PASS |
| Repository detail | `/app/repos/repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3` | `main h1` = "acme/payments-service"; `TypeScript` | `walkthrough-repo-detail.png` | none | PASS |
| Settings | `/app/settings/org` | `main h1` = "Settings"; `Acme Payments` | `walkthrough-settings-org.png` | none | PASS |
| API keys | `/app/settings/api-keys` | `main h1` = "API keys" | `walkthrough-settings-api-keys.png` | none | PASS |
| Health | `/health` | `main h1` = "Health" | `walkthrough-health.png` | none | PASS |
| Report preview | `/report/rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2` | `h1` = "Report"; "PDF export for scan …010"; print layout has no `Primary`/`Breadcrumb` navigation | `walkthrough-report.png` | none | PASS |
| Onboarding | `/onboarding` | visible `h1` beginning "Create"; standalone auth layout (no primary nav) | `walkthrough-onboarding.png` | none | PASS |
| Reduced motion | `/app` | `prefers-reduced-motion: reduce` → computed transition `1e-05s` | n/a | none | PASS |
| Mobile drawer | `/app` at 375×812 | "Open navigation" visible; `role="dialog"` named "Navigation" opens; `scrollWidth - innerWidth = 0` | `walkthrough-mobile-drawer.png` | none | PASS |

### Video

A Playwright MCP `recordVideo` context replayed the full route sequence (landing → overview →
scans → scan detail → coverage → findings → remediation → remediation index → rules → audit →
repos → settings → health → report → overview), asserting each `h1` as it went. The resulting
recording is `.playwright-mcp/rebuild-walkthrough.webm` (2,444,123 bytes).

### Real PDF endpoint

The authenticated download endpoint was verified against the real rendered report in the earlier
full-stack pass; raw response evidence is in `.playwright-mcp/download-verification.txt`:

- `GET /api/v1/report/pdf/ade5a67e-d3fd-4e63-8605-04aacfca1feb/download` → 200
- content type `application/pdf`, content length 17,485
- SHA-256 `48923417436141b8822b6850a352af9001f91889db6c8555a4fa8a9a1d27c1ee`
- header `%PDF-1.3`; decoded text includes `666ghj/MiroFish`, commit `7657031`,
  `SCORE 100.0`, `GRADE A`, `FINDINGS 12`, `dpdpa-2026.10.1`.

Re-confirmed during the final flag-free pass by hashing the orchestrator's stored report bytes
at `D:\tmp\dpdpa-reports\ade5a67e-d3fd-4e63-8605-04aacfca1feb\report.pdf`: 17,485 bytes,
SHA-256 `48923417436141b8822b6850a352af9001f91889db6c8555a4fa8a9a1d27c1ee`, header `%PDF-1.3`
— byte-for-byte identical to the authenticated endpoint response. The live `dev-session`
bootstrap needs the orchestrator process, which was stopped during this UI pass, so the HTTP
download itself was not repeated; the stored response evidence above remains the authoritative
artifact for the endpoint check.

# E2E UX findings (jovVix audit)

Collected while driving a real scan of `improwised/jovVix` through the browser
as a normal user. Dev overrides from `docs/architecture.md` §12 were enabled so
the 100 MB repository and monthly quota did not block the flow.

## Resolved during the session

| Symptom | Root cause | Fix |
| --- | --- | --- |
| `Export PDF` returned `402 Monthly report quota exceeded for this plan.` | Running orchestrator was an older build without `UNLIMITED_PLAN_QUOTA=true` | Rebuilt/restarted with the dev override; quota source now wired through `effectivePlanLimits()` |
| `/report/<reportId>` showed only “PDF export for scan …” and an export button | Report preview page was a placeholder | `NewReport.vue` now renders the full view model with score, sections, findings, methodology, download and print actions |
| Scan detail linked to `/report/<scan.id>`, which did not exist | Scan ID was used where a report ID was required | Scan detail uses `DownloadButton` and offers `Preview` with the real report ID |
| Scan detail skeleton flickered on every poll | `useFetch.refresh()` marked status `pending` | First-load-only loading signal in `useScanPolling.ts` |
| Generated PDF had blank middle pages (33 pages, several with only a footer) | PDFKit auto-paginated when footer text was drawn inside the bottom margin | Footer draw temporarily clears the bottom margin; report is now 11 pages with content on every page |

## Open findings

These are user-visible issues observed in the same session, ordered by
priority. None are blocking the scan flow; they are candidates for follow-up
issues.

| Priority | Screen | Observation | Suggested fix |
| --- | --- | --- | --- |
| P2 | `/app/settings/org` | Dead end: only “Settings / ORGANISATION / Local Dev Org”, no actions | Add settings sub-navigation and actionable cards for profile, members, plan/quota and danger zone |
| P2 | Scan detail / report | All 45 findings show `Unmapped` while the score is 100 | Explain mapping coverage next to the score: 100 means no mapped DPDPA control violations, not no security findings; list unmapped finding counts |
| P2 | Scan detail | A failed export leaves a sticky red banner and changes the button to `Retry PDF`, with no reset date or guidance | Auto-dismiss the error, reset the label, and show when the quota resets |
| P2 | New scan modal | “2 of 5 scans used this month” with no reset date or limit explanation | Show the reset date and a short “what happens at the limit” hint |
| P2 | Small screens (375 px) | Overview has ~3 px horizontal page overflow; wide tables lack a scroll hint | Contain tables in an explicitly scrollable wrapper or switch to cards on small screens |
| P3 | `/app/scans` | Duplicate `+ New scan` buttons | Keep a single primary action |
| P3 | `/app/scans/new` | Direct URL dead-ends with “This scan could not be loaded. Retry” | Redirect to the scans page or render the real new-scan flow |
| P3 | Audit page | Only action search; raw actor/resource IDs and no date/user filters | Show friendly labels and add date/actor filters |
| P3 | `/health` | Only “Health API healthy” | Show database, Redis, queue and runner status separately |
| P3 | All routes | Console warning `[NUXT_E4007] Your project has layouts but the <NuxtLayout /> component has not been used.` | Remove unused layouts or use `<NuxtLayout>` explicitly |

Not a finding: the new-scan modal labels (`GitHub repository URL`,
`Branch, tag, or commit`, profile options) are present and readable.

Design constraints still apply: `docs/design.md` pins the slate-and-teal
palette and `@nuxt/ui` 3.3.7. UI fixes should not silently change either.

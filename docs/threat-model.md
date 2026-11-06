# Threat model — draft

> **Status: Draft — needs security lead review.** (tasks.md P0-09; solo-dev sign-off is deferred
> until a security lead is available, alongside the P0-10/P0-11 legal sign-offs.)

`docs/security.md` is the authoritative control document; this draft arranges the same material
per trust boundary so it can be reviewed boundary-by-boundary. Where the two differ,
`docs/security.md` wins.

## Assets and actors

See `docs/security.md` §2.1 (assets, highest = customer source code and platform credentials) and
§2.2 (actors: external attacker, malicious tenant, malicious repository author, curious tenant,
insider, supply-chain attacker). Security objectives are §1.

## Trust boundaries and STRIDE

| Boundary | Spoofing | Tampering | Repudiation | Information disclosure | Denial of service | Elevation of privilege |
|---|---|---|---|---|---|---|
| Browser → Nitro (edge) | OAuth state; signed, server-side session cookie | TLS; CSRF tokens; trusted-proxy config | Request IDs; append-only audit log | CSP; no PII in URLs; generic errors | WAF; body-size caps; Redis-backed rate limits (30/min resolve) | RBAC role checks; route-level limits (`nuxt-security`) |
| Nitro → orchestrator | HMAC + internal service key | HMAC over request body | Request ID propagation | Private network only; no user data beyond org claim | Timeouts; circuit breaker; per-org concurrency | Org claim derived from session only — never from body fields |
| Orchestrator → PostgreSQL / Redis | TLS + IAM auth (Postgres); credentials from secrets manager (Redis, 90-day rotation) | Transactions (Postgres); queue payloads carry scan IDs and metadata only | Audit log | Least-privilege role + row-level security; Redis holds no code (architectural invariant, security.md §6.1) | Connection-pool caps; queue quotas; Redis at rest encrypted with short TTLs | No DDL at runtime; no service account token for the DB |
| Runner → GitHub and callback | Anonymous HTTPS to `github.com` only (ADR-011); per-scan HMAC on callbacks | TLS for clone; HMAC over callback body; digest-pinned scanner image | Git logs without contents; batch IDs | No credentials exist to leak; callbacks carry findings only, never code | Clone timeout; `--depth 1`; size probe before enqueue; batch caps | DNS-pinned `github.com`, redirects disabled; scan-ID-bound callback token |
| Renderer → Puppeteer | Internal queue identity only | Renderer loads internal report HTML only | Job events; audit | Customer data stays in-cluster; no external PDF service | Render timeout; memory limits on the Chromium pod | No user-supplied URLs reach Chromium (kills render SSRF) |

## Abuse cases

The six review cases, each mapped to its control in `docs/security.md`:

| Abuse case | Control (security.md) |
|---|---|
| **Existence oracle** — probing whether a private repository exists | One identical `REPO_NOT_FOUND` (404) for private and nonexistent repositories; per-user resolve limit 30/min (§2.4) |
| **SSRF via repo URL** — submitting a URL that resolves or redirects to an internal host | Strict URL parser + host allowlist; `http.followRedirects=false`; no `3xx` followed anywhere; private-range guard after resolution (§2.4, §7.3) |
| **Secret exfiltration via findings** — reading matched secrets out of reports or logs | Secret findings never include the matched value: salted SHA-256, ≤4-char prefix, length only; `evidenceRedacted` is allowlisted; log masking `****@domain` / `****`; allowlist logging + CI secret scanning (§6.2, §2.4) |
| **Cross-tenant access** — guessing another tenant's scan or report | UUIDs plus `org_id` scoping; `404` not `403`; row-level security; application/database/network/pod isolation (§2.4, §4) |
| **Callback forgery** — replaying or forging runner callbacks | Per-scan HMAC; scan-status check; batch idempotency; short-lived scan-ID-bound token (§2.4) |
| **Poisoned clone** — a malicious repository attacking the scanner | Scanners never install dependencies; fixed scanner config from the image (repo config ignored); `--no-recurse-submodules` + egress allowlist; digest-pinned images; size checks, disk quota, timeout; gVisor + `emptyDir`, no service-account token (§2.4, §5.1, ADR-003) |

## Out of scope for this draft

- **Post-MVP boundaries:** GitHub App credential minting, webhook-triggered rescans, and
  private-repository scanning (deferred by ADR-011) will each need new boundary rows when they ship.
- **Legal sign-off** of rule-pack mappings (P0-10/P0-11) — separate track.
- Full STRIDE pass over third-party dependency compromise — tracked as the supply-chain actor in
  security.md §2.2 with CI controls (semgrep, gitleaks, audit, Trivy) rather than a boundary row.

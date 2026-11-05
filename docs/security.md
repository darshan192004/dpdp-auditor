# DPDPA GitHub Code Auditor — Security and Hardening

| Field | Value |
|---|---|
| Document version | 1.0 |
| Status | Approved for MVP build |
| Date | 2026-11-04 |
| Owner | Security lead |
| Reviewers | CTO, DPO, external pen-test firm |
| Related documents | `architecture.md`, `database.md`, `api.md`, `PRD.md` |

---

## 1. Security objectives

1. **Customer source code is never retained.** Not in a database, object store, log, cache, or backup.
2. **Tenants cannot reach each other.** At the application, database, network, and pod layers.
3. **A malicious repository cannot compromise the platform.** Scanning is treated as hostile-code execution.
4. **Credentials are short-lived and narrowly scoped.** GitHub installation tokens live at most one hour; API keys are hashed and revocable.
5. **Every security-relevant action is attributable.** Append-only audit logs, request IDs, and trace propagation.
6. **The product is defensible in an enterprise security review.** Documented controls, evidence, and a working incident process.

### Non-goals

- The product does not certify a customer's DPDPA compliance.
- The product does not process customer end-user personal data at scale; it inspects code that may contain PII.
- The product does not claim SOC 2 or ISO 27001 certification at launch, though the control set is designed to support those audits.

---

## 2. Threat model

### 2.1 Assets

| Asset | Sensitivity | Where it lives |
|---|---|---|
| Customer source code | Highest | Scan pod `emptyDir`, memory only |
| GitHub installation tokens | High | Orchestrator memory, K8s Secret for a scan |
| Session cookies and API keys | High | Browser, hashed in PostgreSQL |
| Findings and evidence | High | PostgreSQL, redacted |
| PDF reports | Medium | Object storage, signed URLs |
| User and org data | Medium | PostgreSQL |
| Rule packs and scoring | Low | Git repository, PostgreSQL |
| Platform infrastructure credentials | Highest | Secrets manager, workload identity |

### 2.2 Actors

- External attacker with no account.
- Malicious or compromised customer account.
- Malicious repository author attempting to attack the scanner.
- Curious tenant attempting horizontal access.
- Insider with production access.
- Supply-chain attacker targeting a dependency or scanner image.

### 2.3 Trust boundaries and STRIDE

| Boundary | Spoofing | Tampering | Repudiation | Information disclosure | Denial of service | Elevation |
|---|---|---|---|---|---|---|
| Browser → edge | OAuth state, session cookie | TLS, CSRF | Request ID, audit log | CSP, no PII in URLs | WAF, rate limits | RBAC checks |
| Edge → Nitro | Trusted proxy config | Signed cookies | Access logs | Generic errors | Body size caps | Role checks |
| Nitro → orchestrator | HMAC + internal key | HMAC over body | Request ID | Private network | Timeouts, circuit breaker | Org claim from session only |
| GitHub → webhook | HMAC-SHA256 | Signature over raw body | Delivery ID log | 401 without detail | 1 MB cap, rate limit | Installation cross-check |
| Orchestrator → Job | K8s Secret, SA token audience | Digest-pinned image | Job events, audit | Secret scoped to one scan | Resource limits, deadline | No SA token mounted |
| Runner → GitHub | Installation token | TLS | Git logs without contents | Token never logged | Clone timeout | Repo-scoped token |
| Runner → orchestrator | Per-scan HMAC + SA token | HMAC over body | Batch IDs | Findings only, no code | Batch caps | Scan-ID bound |
| Orchestrator → PostgreSQL | TLS + IAM auth | Transactions | Audit log | Least-privilege role, RLS | Connection pool caps | No DDL at runtime |

### 2.4 Abuse cases and controls

| Abuse case | Control |
|---|---|
| Submit `https://github.com/../../etc/passwd` or a non-GitHub URL | Strict URL parser, host allowlist, path regex, redirects disabled |
| Submit a repository containing a `.gitmodules` that clones an internal host | `--no-recurse-submodules`, network egress allowlist |
| Submit a repository with a 10 GB file or zip bomb | Size check before clone, `--depth 1`, disk quota, timeout |
| Submit a repository with a malicious `package.json` lifecycle script | Scanners never install dependencies; they parse files only |
| Submit a repository with a crafted Semgrep rule or config | Scanner runs with a fixed config from the image; repo config ignored |
| Use a finding's file path to escape the workspace | Paths are metadata only; nothing is read from the path after scanning |
| Guess another tenant's scan ID | UUIDs plus `org_id` scoping; `404` not `403` |
| Replay a runner callback | Per-scan HMAC, scan status check, batch idempotency, short token |
| Exfiltrate secrets through logs | Redaction at source; allowlist logging; CI secret scanning |
| Abuse PDF rendering for SSRF | Renderer only loads the internal report HTML; no user-supplied URLs |
| Exhaust scan quota to run up cost | Plan quotas, per-org concurrency, rate limits, cost alarms |

---

## 3. Identity and access

### 3.1 User sign-in

- GitHub OAuth with PKCE and a signed `state` value.
- Scope: `read:user user:email` only. **No `repo` scope.**
- Session: `nuxt-auth-utils` sealed cookie.
  - `httpOnly: true`
  - `secure: true`
  - `sameSite: 'lax'`
  - `maxAge: 8 hours`, absolute; 30-minute idle timeout enforced server-side
  - `__Host-` prefix in production
- Session rotation on privilege change and on login.
- Logout clears the cookie and revokes the server-side session record.
- CSRF: double-submit token for state-changing browser requests, plus `SameSite=Lax`.

### 3.2 Repository access — GitHub App

| Token | Lifetime | Scope | Storage |
|---|---|---|---|
| GitHub App JWT | 10 minutes | App-level metadata | Memory only |
| Installation access token | 1 hour (GitHub-defined) | Selected repositories, `contents: read`, `metadata: read` | Memory cache ≤ 50 minutes; K8s Secret for one scan |
| User OAuth token | Session | Identity only | Never persisted |

- Installation tokens are minted on demand, cached in memory with a 50-minute TTL, and never written to PostgreSQL or logs.
- The token is delivered to the scan pod through a Kubernetes Secret with an owner reference and a 15-minute Job deadline.
- Uninstalling the GitHub App or suspending an installation immediately blocks new token minting.
- Token refresh on a `401` during clone is allowed once per scan.
- The GitHub App private key lives in the secrets manager and is mounted as a file, never an environment variable.

### 3.3 API keys

- Format: `dpk_<env>_<32 bytes base62>`; only a SHA-256 hash is stored.
- Shown once at creation; never retrievable.
- Scoped: `scan:read`, `scan:write`, `report:read`, `repo:read`.
- Organisation-bound; cannot cross tenants.
- Optional expiry, maximum 365 days.
- Revocation is immediate; the auth cache TTL is 30 seconds.
- Last-used timestamp is recorded without the key.

### 3.4 Role matrix

| Action | Viewer | Auditor | Admin | Owner |
|---|---|---|---|---|
| View scans/findings/reports | ✅ | ✅ | ✅ | ✅ |
| Export PDF | ❌ | ✅ | ✅ | ✅ |
| Start/cancel scan | ❌ | ✅ | ✅ | ✅ |
| Triage findings | ❌ | ✅ | ✅ | ✅ |
| Connect/disconnect repos | ❌ | ❌ | ✅ | ✅ |
| Invite/remove members | ❌ | ❌ | ✅ | ✅ |
| Manage API keys | ❌ | ❌ | ❌ | ✅ |
| Change retention | ❌ | ❌ | ✅ | ✅ |
| Billing / delete org | ❌ | ❌ | ❌ | ✅ |

Authorisation is checked server-side on every request. UI hiding is not a control.

---

## 4. Tenant isolation

| Layer | Control |
|---|---|
| Application | `org_id` derived from session/API key; every query filters on it; no org ID accepted from the client |
| Database | Shared schema with mandatory `org_id`; optional RLS with `SET LOCAL app.current_org`; runtime role cannot bypass RLS |
| Object storage | Key prefix `reports/<orgId>/...`; bucket policy private; signed URLs checked against org before issuance |
| Queue | Payloads carry IDs only; worker reloads and verifies `org_id` |
| Kubernetes | One namespace per environment; scan Jobs labelled with org and scan; NetworkPolicy denies pod-to-pod traffic |
| Cache | Keys prefixed by org; no cross-tenant cache reuse; auth cache key includes org |
| Logs | `orgId` field for correlation; no code or PII |

**Test requirement:** an integration test creates two orgs and attempts every read endpoint with the other org's IDs; all must return `404`. A second test drops `SET LOCAL` and asserts RLS returns zero rows.

---

## 5. Container and Kubernetes isolation

### 5.1 Scan pod controls

- gVisor (`runAsNonRoot`, `runAsUser: 10001`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]`, `seccompProfile: RuntimeDefault`).
- No service-account token mounted (`automountServiceAccountToken: false`).
- No hostPath, no PVC, no host network, no host PID/IPC.
- `emptyDir` workspace with a 6 GiB `sizeLimit`; deleted with the pod.
- CPU, memory, and ephemeral-storage limits; `activeDeadlineSeconds: 900`.
- `backoffLimit: 0`; retries are orchestrated explicitly, not by the Job controller.
- `ttlSecondsAfterFinished: 300`.
- Image pinned by digest; cosign signature verified by an admission policy (Kyverno or Sigstore policy-controller).
- Dedicated node pool with taint `workload=scanner:NoSchedule`; no other workloads scheduled there.
- Read-only scanner config baked into the image; repository-provided configs ignored.

### 5.2 Network policy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: scan-runner-egress
  namespace: scanners
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: scan-runner
  policyTypes: [Ingress, Egress]
  ingress: []
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
      ports:
        - { protocol: UDP, port: 53 }
        - { protocol: TCP, port: 53 }
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: app
          podSelector:
            matchLabels:
              app.kubernetes.io/name: orchestrator
      ports:
        - { protocol: TCP, port: 3001 }
    # GitHub publishes ranges at https://api.github.com/meta.
    # Prefer a Cilium FQDN policy or an egress gateway over hard-coded CIDRs.
    - to:
        - ipBlock:
            cidr: 140.82.112.0/20
      ports:
        - { protocol: TCP, port: 443 }
```

- DNS is restricted to the cluster resolver.
- Egress to the metadata server (`169.254.169.254`) is blocked by policy and by the cloud firewall.
- Egress to RFC 1918, loopback, and link-local ranges is denied.
- The orchestrator namespace accepts traffic only from `web`, `renderer`, and `scanners`.

### 5.3 RBAC

The orchestrator's ServiceAccount may only:

```yaml
apiGroups: ["batch"]
resources: ["jobs"]
verbs: ["create", "get", "list", "watch", "delete"]
---
apiGroups: [""]
resources: ["secrets"]
verbs: ["create", "get", "delete"]
```

Scoped to the `scanners` namespace via `Role`/`RoleBinding`. No cluster-wide permissions.

---

## 6. Zero-retention code handling

### 6.1 Lifecycle

| Stage | Location | Deletion |
|---|---|---|
| Clone | `/workspace/repo` on `emptyDir` | Pod termination |
| Scanner output | `/workspace/out` on `emptyDir` | Pod termination |
| Findings callback | HTTPS request body in memory | Request ends; persisted fields only |
| Raw SARIF (opt-in) | S3 `raw/<org>/<scan>/` | 24-hour lifecycle |
| Job metadata | Kubernetes API | `ttlSecondsAfterFinished: 300` |
| Scan Secret | Kubernetes API | Owner reference to Job; deleted with Job |

There is **no code path** that writes repository contents to PostgreSQL, Redis, S3, or logs. This is an architectural invariant, not a cleanup job.

### 6.2 Redaction rules

- Secret findings never include the matched value. Store a salted SHA-256 hash and, at most, a four-character prefix and the value length.
- PII in log statements is masked: emails become `****@domain`, card numbers become `****1234`, tokens become `****`.
- File paths are retained; file contents are not.
- Stack traces from scanners are truncated and stripped of environment variables.
- `context` is allowlisted per scanner (rule category, language, framework, resource type).

### 6.3 Verification (must run in CI and before each release)

1. Seed a fixture repository with a unique canary string in source, a fake AWS key, and a fake email.
2. Run a full scan through the real pipeline.
3. Query PostgreSQL for the canary across all text and JSON columns; expect zero rows.
4. List the S3 bucket and download every object; expect no canary.
5. Search logs and traces for the canary; expect zero matches.
6. Inspect the completed Job and Secret; expect both deleted within 5 minutes.
7. Record the result as a signed test artifact attached to the release.

A single canary hit is a **P1 security incident**, not a test failure to retry.

---

## 7. Application security

### 7.1 Input validation

- Every public endpoint validates with Zod at the Nitro boundary.
- Every internal endpoint validates again in the orchestrator; internal traffic is not implicitly trusted.
- Validation rules:
  - `githubUrl`: HTTPS, host exactly `github.com`, path `^/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$`, no query, no fragment, no credentials, no port.
  - `ref`: `^[A-Za-z0-9._/-]{1,255}$`, no `..`, no leading `-`.
  - IDs: prefixed opaque format; resolved to UUID server-side.
  - Pagination: bounded; offsets above 10,000 rejected.
  - Notes: max 4,000 chars; rendered as text, never HTML.
- Unknown fields are rejected. Request bodies above 1 MB are rejected (5 MB for webhooks is not needed; GitHub webhooks are capped at 1 MB by policy).

### 7.2 Injection and output

- Prisma parameterises all queries. Raw SQL only in reviewed analytics/retention code with bound parameters.
- Vue escapes by default. `v-html` is forbidden for user or scanner content.
- The PDF template escapes all interpolated values; the renderer loads only a local template, not a user URL.
- File paths are displayed as text, never used to construct filesystem paths after scanning.
- CSV exports (post-MVP) prefix formula-leading characters (`=`, `+`, `-`, `@`) to prevent CSV injection.

### 7.3 SSRF

- The only user-influenced fetch is repository resolution, which is constrained to GitHub's API and clone endpoints.
- DNS is resolved and every address checked against public ranges; private, loopback, link-local, and reserved addresses are rejected.
- Redirects are disabled for server-side fetches.
- GitHub API calls use a fixed base URL, not a user-supplied one.
- Webhook processing never fetches a URL from the payload.
- The renderer never loads remote images or fonts; assets are bundled.

### 7.4 File and path safety

- No user-supplied path is used for a delete, move, or write.
- Retention jobs operate on database rows and fixed S3 prefixes, never on a path from a request.
- The scan runner resolves the workspace to an allowlisted root and refuses symlinks that escape it.
- Archive extraction is not performed on untrusted input.

### 7.5 Security headers

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains; preload` |
| `Content-Security-Policy` | Nonce-based; see §8 |
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Cache-Control` (authenticated HTML/JSON) | `no-store` |

---

## 8. `nuxt-security` configuration

Pinned module version: `nuxt-security@^2`. Exact option names follow the pinned release; the configuration below is the contract.

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['nuxt-security', 'nuxt-auth-utils', '@pinia/nuxt', '@nuxt/ui'],

  runtimeConfig: {
    redisUrl: process.env.REDIS_URL,
    orchestratorUrl: process.env.ORCHESTRATOR_URL,
    orchestratorHmacKey: process.env.ORCHESTRATOR_HMAC_KEY,
    githubAppId: process.env.GITHUB_APP_ID,
    githubAppPrivateKey: process.env.GITHUB_APP_PRIVATE_KEY,
    githubClientId: process.env.GITHUB_CLIENT_ID,
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET,
    sessionPassword: process.env.NUXT_SESSION_PASSWORD,
    public: {
      appUrl: process.env.NUXT_PUBLIC_APP_URL,
      sentryDsn: process.env.NUXT_PUBLIC_SENTRY_DSN,
    },
  },

  security: {
    // ---------- Response headers ----------
    headers: {
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubdomains: true,
        preload: true,
      },
      xFrameOptions: 'DENY',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
      crossOriginOpenerPolicy: 'same-origin',
      crossOriginResourcePolicy: 'same-origin',
      permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
      },
      contentSecurityPolicy: {
        'default-src': ["'self'"],
        'base-uri': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'form-action': ["'self'"],
        'script-src': ["'self'", "'nonce-{{nonce}}'", "'strict-dynamic'"],
        // Exception: Vue scoped styles and Nuxt UI inject inline style attributes.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://avatars.githubusercontent.com',
        ],
        'font-src': ["'self'", 'data:'],
        'connect-src': [
          "'self'",
          'https://*.sentry.io',
          'https://*.posthog.com',
        ],
        'worker-src': ["'self'", 'blob:'],
        'manifest-src': ["'self'"],
        'upgrade-insecure-requests': [],
      },
    },

    // ---------- CORS ----------
    corsHandler: {
      origin: ['https://app.dpdpa-auditor.example'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Authorization',
        'Content-Type',
        'Idempotency-Key',
        'X-Request-Id',
      ],
      exposeHeaders: [
        'X-Request-Id',
        'RateLimit-Limit',
        'RateLimit-Remaining',
        'RateLimit-Reset',
        'Retry-After',
      ],
      credentials: true,
      maxAge: 600,
    },

    // ---------- CSRF ----------
    csrf: true,

    // ---------- Request limits ----------
    requestSizeLimiter: {
      maxRequestSizeInBytes: 1_048_576,
      maxUploadFileRequestInBytes: 5_242_880,
    },

    // ---------- Method restriction ----------
    allowedMethodsRestricter: {
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    },

    // ---------- Cross-site scripting input guard ----------
    xssValidator: {},

    // ---------- Rate limiting (shared Redis store) ----------
    rateLimiter: {
      driver: {
        name: 'redis',
        options: {
          url: process.env.REDIS_URL,
        },
      },
      match: ['/api/**'],
      tokens: 300,
      interval: 60,
    },

    hidePoweredBy: true,
    removeLoggers: true,
  },

  nitro: {
    routeRules: {
      '/api/**': { cors: false },
      '/app/**': { headers: { 'cache-control': 'no-store' } },
    },
  },
})
```

### 8.1 Route-level limits

`nuxt-security` applies one global rule; stricter limits are enforced in Nitro middleware backed by the same Redis store:

| Route | Limit | Window |
|---|---|---|
| `/api/auth/**` | 10 per IP | 15 min |
| `POST /api/v1/scan` | 10 per user | 1 hour (Free), plan-scaled above |
| `POST /api/v1/report/pdf` | 20 per org | 1 hour |
| `POST /api/webhooks/github` | 120 per IP | 1 min |
| All other `/api/**` | 300 per user | 1 min |

Use a sliding-window counter keyed by `orgId:userId:route` and `ip:route` for unauthenticated routes. Never trust `X-Forwarded-For` outside the trusted proxy.

### 8.2 Deployment checklist for headers

- `curl -I https://app.../` shows every header.
- `Content-Security-Policy` contains a per-request nonce and no `unsafe-inline` for scripts.
- Browser console shows no CSP violations on dashboard, findings, and report pages.
- HSTS preload is submitted only after the domain is stable.
- CORS preflight from an unlisted origin is rejected.

---

## 9. Rate limiting and abuse prevention

- Edge WAF (Cloudflare or AWS WAF) blocks known bad bots, volumetric floods, and malformed requests.
- Application limits are enforced in Redis, not in memory, so they survive multiple replicas.
- Login and OAuth callbacks are limited per IP and per account.
- Scan creation is limited per org plan and per repository (one active scan per ref).
- Failed authorization attempts are logged and counted; 20 failures in 5 minutes triggers a temporary block.
- Payload caps: 1 MB JSON, 500 findings per callback, 100 callbacks per scan.
- Cost alarms fire at 80% of the per-scan budget.

---

## 10. Secrets management

| Secret | Storage | Rotation |
|---|---|---|
| GitHub App private key | Secrets manager; mounted file | 90 days |
| GitHub OAuth client secret | Secrets manager; env at runtime | 90 days |
| Session encryption key | Secrets manager; env | 90 days, with key ring |
| Internal HMAC key | Secrets manager; env | 30 days, dual-key acceptance |
| Database credentials | Workload identity / IAM auth | 30 days |
| Redis credentials | Secrets manager | 90 days |
| S3 access | Workload identity (IRSA) | Automatic |
| Webhook secret | Secrets manager | 90 days |
| Sentry/PostHog keys | Secrets manager; public DSN only | 180 days |

Rules:

- No secret in Git. Gitleaks runs pre-commit and in CI on the full history.
- `.env.example` contains placeholders only; real `.env*` files are gitignored.
- Secrets are never logged, returned in API responses, or embedded in error messages.
- A secret that reaches a remote is rotated before history is rewritten.
- Workload identity is preferred over static cloud keys.

---

## 11. Supply chain

- pnpm with a committed lockfile; CI uses `--frozen-lockfile`.
- Dependency install scripts are blocked by default (`pnpm` `ignore-scripts` policy); exceptions are reviewed and allowlisted.
- Renovate opens grouped, reviewed updates weekly; security updates are fast-tracked.
- `pnpm audit --audit-level=high` runs on every PR and release.
- Container images: minimal distroless or Chainguard base, non-root, pinned by digest, scanned with Trivy, signed with cosign.
- SBOM (CycloneDX) is generated for every image and attached to the release.
- Admission control rejects unsigned or unscanned images.
- Scanner binaries are pinned by version and checksum; upgrades require a rule-pack compatibility run.
- No floating `latest` tags anywhere.

---

## 12. Data protection

| Data state | Control |
|---|---|
| In transit | TLS 1.2+ everywhere, including internal services; HSTS at the edge |
| At rest — PostgreSQL | Volume encryption (cloud KMS), encrypted backups, optional column encryption for sensitive fields |
| At rest — S3 | SSE-KMS, bucket private, versioning off for reports, lifecycle deletion |
| At rest — Redis | Encryption in transit and at rest; no code; short TTLs |
| Backups | Encrypted, cross-zone, restore tested quarterly |
| Keys | Cloud KMS with annual rotation; separation of duties |

Data classification:

| Class | Examples | Handling |
|---|---|---|
| Restricted | Source code, secrets, tokens | Never persist; memory only; redact |
| Confidential | Findings, report PDFs, user emails | Encrypt at rest; org-scoped; signed URLs |
| Internal | Scan metadata, rule packs | Standard access control |
| Public | Marketing site, docs | No restriction |

PII in telemetry is prohibited. Sentry uses `sendDefaultPii: false` and before-send scrubbing. PostHog uses a proxy, disables autocapture on authenticated forms, and masks inputs.

---

## 13. Logging, monitoring, and audit

### Logged

- Authentication success/failure (user ID, IP, user agent, reason code).
- Authorisation denials (route, role, org).
- Scan lifecycle transitions.
- Repository connect/disconnect.
- Finding triage.
- Report download.
- API key creation/revocation.
- Retention changes and deletions.
- Webhook signature failures.
- Rate-limit blocks.

### Never logged

- Session cookies, OAuth codes, tokens.
- GitHub installation tokens or App JWTs.
- Repository contents, diffs, or file bodies.
- Secret values or full evidence.
- Full request bodies for scan or triage endpoints.
- Signed S3 URLs.

### Audit trail

- `audit_logs` is append-only; the application role has `INSERT` and `SELECT`, no `UPDATE` or `DELETE`.
- Retention: one year; export available to admins in JSON.
- Each entry carries actor, action, resource, IP, user agent, and allowlisted metadata.
- Tamper evidence: daily hash chain of the previous day's rows stored in a separate bucket (post-MVP).

### Alerts

| Alert | Condition | Severity |
|---|---|---|
| Retention violation | `source_retention_violation_total > 0` | P1 |
| Cross-tenant access attempt | 403/404 spike on org-scoped routes with mismatched IDs | P1 |
| Webhook signature failure spike | > 10/min | P2 |
| Auth failure spike | > 20% for 5 min | P2 |
| Scanner image signature failure | any admission rejection | P2 |
| Secret detected in our repo | CI or runtime | P1 |
| Unusual export volume | > 50 PDFs/hour/org | P3 |

---

## 14. DPDPA compliance posture (our own processing)

The customer is the **Data Fiduciary** for personal data in its repositories; DPDPA GitHub Code Auditor acts as a **Data Processor**. We process account data (name, email, GitHub ID), repository metadata, and code-derived findings for the purpose of providing the audit.

| Obligation area | Our control |
|---|---|
| Lawful purpose and notice | Privacy notice and DPA state the purpose, categories, and retention |
| Data minimisation | No source retention; only findings and metadata; no marketing use of customer data |
| Accuracy | User-editable profile; org admin can correct member data |
| Retention and erasure | Documented retention schedule; org deletion within 30 days; code deleted immediately |
| Security safeguards | This document; encryption; access control; pen test |
| Breach notification | Incident response plan; notify customers without undue delay; support their Board notification |
| Data principal rights | Requests are routed to the customer (fiduciary); we assist within contractual timelines |
| Cross-border transfer | India region by default; subprocessors listed; transfer mechanism documented |
| Children's data | Not a target market; no knowing processing of children's data |
| Significant Data Fiduciary | Not applicable to us as a processor; customers may be SDFs and we support their obligations |
| Records of processing | Data map maintained in the DPA and security package |

### Subprocessors (initial)

| Subprocessor | Purpose | Region |
|---|---|---|
| Cloud provider (compute, Postgres, S3) | Hosting | India (`ap-south-1`) |
| Sentry | Error tracking | EU/US with SCCs; PII scrubbed |
| PostHog | Product analytics | EU/US with SCCs; PII scrubbed |
| Email provider | Transactional email | Configured region |
| Billing provider | Payments | Configured region |

The subprocessor list is published, versioned, and requires customer notice before a material change.

### Data subject requests

- The customer forwards requests to `privacy@dpdpa-auditor.example`.
- We verify the requester through the customer's admin.
- We export or delete account data within 30 days, and confirm completion in writing.
- We cannot delete data we never held (source code) — that is stated in the DPA.

---

## 15. Incident response

### Severity

| Level | Definition | Response |
|---|---|---|
| P1 | Confirmed or suspected source-code exposure, cross-tenant access, or credential compromise | Page on-call immediately; incident commander; customer notification within 24 h of confirmation |
| P2 | Service-wide outage, auth bypass without data exposure, malicious scan behaviour | Page on-call; status page; update every 60 min |
| P3 | Limited degradation, single-tenant issue | Ticket; respond within one business day |
| P4 | Cosmetic or informational | Backlog |

### Runbook outline

1. **Detect and declare.** Alert or report → incident channel → severity and commander.
2. **Contain.** Revoke tokens, disable the affected feature flag, isolate the namespace, block the actor.
3. **Preserve evidence.** Snapshot logs and audit rows; do not delete the Job or Secret until captured.
4. **Assess.** Determine data categories, tenants affected, and legal notification triggers.
5. **Eradicate and recover.** Patch, rotate credentials, restore from backup, verify with canaries.
6. **Notify.** Customers, DPO, and regulators as required; legal approves wording.
7. **Postmortem.** Blameless, within five business days; action items with owners and dates.
8. **Test.** Add a regression test or control; update this document.

### Breach notification

- Internal target: assess within 72 hours of confirmation.
- Customer notification: without undue delay, with facts known at the time and a follow-up cadence.
- Regulatory notification: per DPDPA and the instructions of the customer's DPO; we provide the technical evidence they need.
- No speculation about cause or scope in external communications.

---

## 16. Secure development lifecycle

| Stage | Control |
|---|---|
| Design | Threat model for every new boundary; security review for auth, payments, file handling |
| Code | Required review; CODEOWNERS for security-sensitive paths; no direct pushes to `main` |
| CI | Lint, typecheck, unit, integration, Semgrep, Gitleaks, `pnpm audit`, Trivy, license check |
| Pre-release | DAST against staging, container signature verification, SBOM diff |
| Release | Signed images, immutable tags, change log, rollback plan |
| Post-release | Dependency monitoring, runtime alerts, weekly security triage |
| Annually | External penetration test, tabletop incident exercise, access review |

### Security testing matrix

- **SAST:** Semgrep with the OWASP Top Ten and TypeScript/Node rulesets.
- **Secrets:** Gitleaks on the full history, pre-commit and CI.
- **Dependencies:** `pnpm audit`, Renovate, license allowlist.
- **Containers:** Trivy, cosign verify, SBOM.
- **DAST:** OWASP ZAP baseline and authenticated scan against staging.
- **Pen test:** external firm before public launch; retest critical/high findings.
- **Privacy:** canary-retention test on every release.
- **Abuse:** rate-limit and quota tests; SSRF test suite; cross-tenant test suite.

---

## 17. Launch security checklist

- [ ] No critical or high vulnerabilities in code, dependencies, or images.
- [ ] External pen test complete; critical/high remediated or formally accepted with a date.
- [ ] Canary retention test passes and the artifact is attached to the release.
- [ ] Cross-tenant test suite passes for every read and write endpoint.
- [ ] GitHub App permissions are exactly `contents: read` and `metadata: read`.
- [ ] Session cookie flags verified in production.
- [ ] CSP, HSTS, CORS, and rate limits verified with `curl` and browser DevTools.
- [ ] Secrets manager integration verified; no secrets in env files or images.
- [ ] Backup restore drill passed within RTO.
- [ ] Audit log write-only permissions verified.
- [ ] Incident runbook and on-call rotation active.
- [ ] DPA, privacy notice, subprocessor list, and security package published.
- [ ] Status page and security contact (`security@`) live.
- [ ] Vulnerability disclosure policy published.

---

## 18. Residual risks

| Risk | Residual level | Owner | Mitigation |
|---|---|---|---|
| A zero-day in gVisor or the kernel | Low | Platform | Patch cadence, minimal host surface, seccomp |
| A malicious dependency in a scanner image | Low | Security | Digest pinning, SBOM, cosign, vendor review |
| GitHub API outage blocks scans | Medium | Engineering | Queue, retries, status messaging, degraded mode |
| Legal interpretation of a DPDPA clause changes | Medium | Legal | Versioned rule packs, review cadence, disclaimer |
| Insider access to production | Low | Security | Break-glass, audit, least privilege, background checks |
| False negatives from unsupported languages | Medium | Product | Coverage banner, supported-language list, no "clean" claim |
| Customer uploads a repo containing illegal content | Low | Trust & Safety | Terms of service, abuse reporting, no content retention |

---

## 19. Disclaimer

This document describes technical controls. It is not legal advice and does not certify compliance with the DPDPA or any other law. Customers remain responsible for their own compliance, including their notices, consents, retention decisions, and breach notifications.

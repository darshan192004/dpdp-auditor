# DPDPA Auditor — Internal Production Pilot on k3s — Design

| Field | Value |
|---|---|
| Document version | 1.0 |
| Date | 2026-11-26 |
| Status | Approved design — implementation plan to follow |
| Audience | Engineering, security review, internal pilot team |
| Related documents | `docs/architecture.md`, `docs/launch-readiness.md`, `docs/security.md`, `docs/adr/0003-one-kubernetes-job-per-scan.md`, `docs/adr/0008-separate-puppeteer-renderer.md`, `docs/adr/0010-zero-retention-by-construction-not-by-cleanup-job.md` |

---

## 1. Goal and scope

Move DPDPA Auditor into production on the local k3s cluster `imperator.pride.improwised.dev` (`v1.37.0+k3s1`) as an **internal-only pilot**. The first audience is the internal team; there is no public exposure and no public DNS record.

In scope:

- A repeatable deployment of all four workloads plus per-scan runner Jobs.
- Private ingress with TLS from a purpose-generated self-signed CA.
- PVC-backed Postgres, Redis, report storage, and in-cluster registry.
- Individual email/password accounts with per-user audit attribution.
- Immutable image tags and digest-pinned runner images.
- Verification and sign-off gates, including an explicit deferred external penetration test.

Out of scope:

- Public launch, billing, public signup, multi-region, GitHub App installation flow.
- Changing DPDPA controls, weights, grades, `scoringVersion`, or the scoring formula.
- Any change to rule-pack contents (packs remain immutable; changes require a version bump and manifest regeneration).
- Any code path that persists repository source beyond a Job's `emptyDir`.

## 2. Decisions carried into the design

| Decision | Choice |
|---|---|
| Sign-off bar | Internal pilot; external pentest explicitly deferred |
| Sign-in | Individual email/password accounts (attributable in audit log) |
| Account bootstrap | Seed accounts from a deploy-time Kubernetes Secret, hashed on import |
| TLS | Generate a private self-signed CA; issue the app certificate from it |
| Image delivery | In-cluster registry; immutable tags plus digest pinning |
| Workloads | Four Deployments; renderer stays isolated per ADR-008 |
| Runner isolation | Install gVisor and keep the existing hardened Job spec unchanged |

## 3. Topology and network boundary

Two namespaces on the k3s cluster:

- `dpdpa` — `web`, `orchestrator`, `renderer`, in-cluster registry, Postgres, Redis, MinIO, Prometheus, Alertmanager.
- `dpdpa-scanners` — short-lived `scan-runner` Jobs and their per-scan Secrets.

Deployments at one replica each for the pilot. `web` (Nuxt/Nitro) is the only ingress-facing service. `orchestrator` runs BullMQ workers in-process (ADR-007). `renderer` is a separate Deployment (ADR-008). The registry is a Deployment with a PVC. `scan-runner` exists only as Jobs created by the orchestrator's existing Kubernetes driver.

A single Ingress terminates TLS on `dpdpa.pride.improwised.dev`. The certificate is issued by a self-signed CA generated for this pilot; the CA certificate is exported to internal clients so they can trust it. No LoadBalancer or NodePort is exposed outside the internal network.

Default-deny NetworkPolicies in both namespaces, with explicit allows only for:

- ingress controller → `web` on port 3000;
- `web` → `orchestrator` on port 3001;
- `renderer` → `orchestrator` (internal view-model API);
- `orchestrator` → Postgres, Redis, and the registry;
- `scan-runner` Jobs → `orchestrator` findings callback;
- `scan-runner` Jobs → `github.com` egress only.

Pod-to-pod traffic between scan Jobs is denied. Internal HMAC authentication remains in place behind TLS, so the network boundary is defence in depth rather than the only control.

## 4. State, storage, and retention

k3s ships with the `local-path` provisioner, so PVCs are node-bound. All stateful workloads are pinned to the cluster node with a `nodeSelector`. Moving to multiple nodes later is a deliberate change, not an implicit property of this deployment.

| Workload | Storage | Size | Notes |
|---|---|---|---|
| Postgres 16 | PVC `pg-data` | 20 Gi | StatefulSet; single writer is the orchestrator (ADR-005) |
| Postgres backups | PVC `pg-backups` | 20 Gi | Daily `pg_dump` CronJob, 30-day retention |
| Redis 7 | PVC `redis-data` | 5 Gi | `appendonly yes`; no Sentinel in the pilot |
| MinIO | PVC `minio-data` | 50 Gi | Private bucket for PDF reports; 30-day lifecycle |
| Registry | PVC `registry-data` | 20 Gi | Immutable image layers |

Reports stay S3-compatible: a single-node MinIO deployment preserves the existing architecture contract where `renderer` uploads a PDF and `web` issues a short-lived signed URL. No report-storage code changes are needed.

Secrets — Postgres/Redis/MinIO passwords, HMAC keys, the TLS private key, and seed-account records — are Kubernetes Secrets generated at deploy time. No secret value is committed to git.

Zero source retention is unchanged (ADR-010): cloned repositories and scanner scratch output live only in a Job's `emptyDir` and are destroyed with the pod. No code path writes source to Postgres, Redis, MinIO, logs, or a PVC.

Accepted limitations for the pilot: Redis is a single point of failure (queued scans must be retried after loss), and local-path PVCs are tied to one node.

## 5. Runner execution and image supply

All application images are built with the immutable version tag `1.0.0-pilot.1` and pushed to `registry.dpdpa.svc.cluster.local:5000/dpdpa/...`. After each push the image digest is resolved, and the orchestrator is configured with `RUNNER_IMAGE` set to the digest-pinned reference. The rule pack is baked into the runner image, so any rule-pack change requires a new image tag plus manifest regeneration.

The orchestrator's existing Kubernetes driver is used unchanged. Configuration:

- `RUNNER_DRIVER=kubernetes`
- `SCANNERS_NAMESPACE=dpdpa-scanners`
- `RUNNER_IMAGE` set to the digest reference resolved from the pushed `1.0.0-pilot.1` tag, in the form `registry.dpdpa.svc.cluster.local:5000/dpdpa/scan-runner@sha256:<64-hex digest>`

`kubernetes-scan-executor.ts` hardcodes `runtimeClassName: gvisor` plus a `workload=scanner` node selector and toleration. The deployment therefore provisions `runsc`, creates a `RuntimeClass` named `gvisor`, and labels/taints the node `workload=scanner:NoSchedule`. No code change to the Job spec is made.

Job guarantees are retained as-is: `backoffLimit: 0`, `activeDeadlineSeconds: 900`, `ttlSecondsAfterFinished: 300`, `runAsUser: 10001`, read-only root filesystem, dropped capabilities, three `emptyDir` volumes, a per-scan Secret with an `ownerReference` to the Job, and a namespace-scoped ServiceAccount limited to Jobs and Secrets.

## 6. Identity and password auth

The application has no password auth today: `User` has no password column, identity comes from GitHub, and `/api/auth/dev-session` is deliberately 404 in production. The pilot adds password auth as real feature work.

**Schema.** A forward-only Prisma migration adds nullable `passwordHash` and `mustChangePassword` to `User`. Nullability preserves existing GitHub-derived users. Seeded users receive a generated temporary password and must change it at first login. An accompanying ADR records that the internal pilot uses password identity in addition to the existing GitHub OAuth path.

**Login flow.** `POST /api/auth/password/login` in Nitro validates the submitted email and password, then calls a new HMAC-protected orchestrator internal endpoint. The orchestrator looks up the user by email (citext), verifies an argon2id hash in constant time (m=19456 KiB, t=2, p=1, 16-byte salt), enforces Redis rate limits of 5 attempts per email and 20 per IP per 15 minutes, and records `auth.login` with method `password` in the audit log. Nitro then uses the existing session-minting and fail-closed resolution path from `dev-session.post.ts`; no new cookie mechanism is introduced.

**Anti-enumeration.** Unknown email, wrong password, and a locked account all return the same generic error and take the same verification path.

**UI.** `/login` gains an email/password form as the primary pilot path; the GitHub button is hidden by a configuration flag. Existing organisation, membership, and role logic is reused without change, so actions are attributed to individual users from the first login.

**Bootstrap and ongoing administration.** A deploy-time Secret contains the initial user list (email, name, temporary password, role). A one-shot init Job argon2id-hashes the passwords, upserts users, assigns organisation roles, marks first-login rotation required, and the Secret is removed after success. Additional accounts are added by running the same Job with a new Secret; this is documented as the admin procedure. Self-service signup stays disabled.

**Tests.** Unit tests for hashing and rate-limit behaviour; integration tests for login, lockout, and audit recording; e2e tests for the login form; security tests for user enumeration and timing-visible short circuits.

## 7. Observability and operations

Existing Pino structured logging, OpenTelemetry instrumentation, and Prometheus rules are reused. Prometheus and Alertmanager are deployed in the `dpdpa` namespace with one internal receiver. Scrape targets are `web`, `orchestrator`, `renderer`, and the node. The existing `source_retention_violation_total` alert remains a P1. No new dashboards are built for the pilot; the existing runbooks remain authoritative.

A short k3s deployment runbook is added covering image promotion by digest, certificate renewal, Postgres restore from the backup PVC, and cleanup of stuck Jobs/Secrets. The existing scan-failure, renderer, retention-violation, and DB-failover runbooks are reused unchanged.

**Upgrades and rollback.** Every workload and the runner Job reference immutable version tags or digests. Rollback is a redeploy of the prior manifest and prior image, both retained in the registry. Prisma migrations are forward-only and backward-compatible (expand/contract); schema rollback is not automatic and this is stated in the runbook.

## 8. Verification and launch sign-off

Sign-off requires all of the following to pass against the deployed instance:

1. A real scan of `https://github.com/Improwised/jovVix.git` with all DPDPA rules, Standard profile, and a blank ref (resolving to default branch `main`) completes with full scanner coverage, 0 unmapped findings, and 0 `mapping_miss` warnings. Advisory-confidence findings do not change scoring semantics.
2. The report page shows the correct heading, an `Export PDF` control, explicit `Report generated ... by DPDPA Auditor.` attribution, and `Not assessed` for unassessed sections.
3. The exported PDF is A4, has no blank pages, includes explicit DPDPA control codes, and records the rule-pack version.
4. A gVisor-backed scan Job runs to completion and its `emptyDir` workspace is destroyed with the pod.
5. NetworkPolicies are verified to deny unauthorized pod-to-pod paths.
6. Email/password login works, a seeded user is forced to rotate the temporary password, and the audit log attributes actions to the individual user.
7. A Postgres restore drill from the backup PVC passes.

Before sign-off, `docs/launch-readiness.md:40` is corrected from "External penetration test completed" to "Pending — deferred for internal pilot". The repository owner (`darshan192004`) is accountable for commissioning the external pentest, which is due before any non-internal exposure. `docs/security/external-penetration-test-report.md` remains "Pending" and gains a cross-reference to this deferral.

## 9. Testing strategy

- Deployment manifests are linted and applied in a dry-run pass before rollout.
- Application tests (`pnpm test`, `pnpm typecheck`, linting) run on the exact commit that is built into the images.
- Rule-pack hash verification: the runner image's `/dpdpa.yaml` SHA-256 must match `packages/rule-packs/manifest.yaml`.
- Semgrep fixture checks run on the pinned version used by CI.
- End-to-end verification uses real repository data only; no fixture or synthetic repository may be used as launch evidence.

## 10. Risks and accepted exceptions

| Risk | Acceptance |
|---|---|
| External pentest not executed | Deferred for internal-only pilot with a named owner and a due date before any public exposure |
| gVisor install complexity on k3s | Required; if it cannot be provisioned, implementation stops and returns for design revision rather than silently weakening isolation |
| Redis has no HA | Accepted; queued scans are retried after Redis loss |
| local-path PVCs are node-bound | Accepted for a single-node pilot |
| Password auth is new code | Accepted; covered by the schema migration, tests, and audit attribution above |

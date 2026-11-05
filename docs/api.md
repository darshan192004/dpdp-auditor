# DPDPA GitHub Code Auditor — API Specification

| Field | Value |
|---|---|
| Public base URL | `https://app.dpdpa-auditor.example/api/v1` |
| Internal base URL | `http://orchestrator.internal:3001/internal/v1` |
| Version | v1 |
| Document version | 1.0 |
| Date | 2026-11-04 |
| Related documents | `architecture.md`, `database.md`, `security.md`, `design.md` |

---

## 1. Conventions

### 1.1 Transport and format

- HTTPS only for public endpoints. TLS 1.2+; HSTS enabled.
- JSON request and response bodies, `Content-Type: application/json; charset=utf-8`.
- Field names are `camelCase`.
- Timestamps are ISO 8601 UTC with milliseconds: `2026-11-04T09:31:22.481Z`.
- Public IDs are prefixed opaque strings: `org_`, `usr_`, `repo_`, `scn_`, `fnd_`, `rpt_`, `key_`, `req_`.
- Unknown request fields are rejected with `422 VALIDATION_ERROR` rather than ignored.
- Every response carries `X-Request-Id`. Clients may supply `X-Request-Id`; the server validates it against `^[A-Za-z0-9_-]{8,64}$` and generates one otherwise.

### 1.2 Authentication

| Client | Mechanism | Header |
|---|---|---|
| Browser | Encrypted, httpOnly session cookie (`dpdpa_session`) | `Cookie` |
| CI / scripts | Organisation API key | `Authorization: Bearer dpk_live_...` |
| GitHub webhooks | HMAC-SHA256 signature | `X-Hub-Signature-256` |
| Internal services | HMAC + shared internal key | `X-Internal-Signature` |

API keys are scoped. A request using a key without the required scope receives `403 FORBIDDEN`.

### 1.3 Authorisation

- Every request is scoped to exactly one organisation.
- The organisation is derived from the session or API key, never from a request body or query parameter.
- Roles: `owner` > `admin` > `auditor` > `viewer`.
  - `viewer`: read scans, findings, reports.
  - `auditor`: viewer + triage findings + export reports.
  - `admin`: auditor + manage repositories, members, API keys, retention.
  - `owner`: admin + billing, organisation deletion, ownership transfer.

### 1.4 Error envelope

Every non-2xx response has this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request body is invalid.",
    "details": [
      { "path": "ref", "message": "Must be a branch, tag, or 40-character commit SHA." }
    ],
    "requestId": "req_01J8Z3K4M5N6P7Q8R9S0T1U2V3"
  }
}
```

`details` is omitted when it would leak internal information. Stack traces, SQL, and upstream URLs are never returned.

### 1.5 Status codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 202 | Accepted; work continues asynchronously |
| 204 | No content |
| 400 | Malformed request — only for unparseable JSON or a syntactically invalid HTTP request; everything else that fails a check is `422` |
| 401 | Not authenticated |
| 402 | Payment required — plan quota or seat limit reached (`PLAN_LIMIT_EXCEEDED`) |
| 403 | Authenticated but not permitted |
| 404 | Not found, or not visible to this organisation |
| 409 | Conflict (duplicate scan, invalid state transition) |
| 410 | Gone — resource expired past retention (`REPORT_EXPIRED`) |
| 413 | Payload too large (`PAYLOAD_TOO_LARGE`) |
| 422 | Validation failed, or idempotency key reused with a different payload |
| 429 | Rate limited |
| 500 | Internal error |
| 503 | Dependency unavailable; `Retry-After` present |

**400 vs 422:** `400` is reserved for requests the server cannot parse at all (malformed JSON body, invalid header encoding); any request that parses but violates a schema or semantic rule — including unknown fields, bad enum values, or a failed idempotency-key format check — returns `422 VALIDATION_ERROR`.

### 1.6 Pagination

All list endpoints accept:

| Parameter | Default | Maximum |
|---|---|---|
| `page` | 1 | Validated against the offset budget: `page × pageSize ≤ 10,000` |
| `pageSize` | 20 | 100 |
| `sort` | `-createdAt` | See endpoint |

All list sorts are made stable by appending the primary key as a tiebreaker (`-createdAt,id`); clients may pass the tiebreaker explicitly. Without it, rows with equal sort keys could shift between pages.

Response:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 142,
    "totalPages": 8
  }
}
```

Offsets above 10,000 are rejected with `422 PAGINATION_LIMIT`; clients must narrow filters instead.

### 1.7 Idempotency

`POST /api/v1/scan` and `POST /api/v1/report/pdf` require `Idempotency-Key` for API-key clients and accept it for browser clients. The UI generates a UUID per user intent and reuses it on retry.

- **Format:** `^[A-Za-z0-9_-]{16,64}$` — the UI sends a UUID v4 (36 chars) and CI sends a 40-char git SHA; both fit. A key outside the pattern → `422 VALIDATION_ERROR`.
- Keys are scoped to `(org_id, key)` and retained for 7 days.
- Same key + same payload → the original response, with `Idempotent-Replayed: true`.
- Same key + different payload → `422 IDEMPOTENCY_CONFLICT`.
- Concurrent duplicate while the first is in flight → `409 CONFLICT` with the existing resource ID.

### 1.8 Rate limits

| Scope | Limit |
|---|---|
| Authenticated reads | 300 requests/minute/user |
| Authenticated writes | 60 requests/minute/user |
| Scan creation | Free 10/hour, Starter 60/hour, Growth 300/hour, Enterprise custom |
| PDF generation | 20/hour/org |
| Auth endpoints | 10 attempts/15 minutes/IP |
| API keys | Same as the owning org plan |

Responses include:

```
RateLimit-Limit: 60
RateLimit-Remaining: 42
RateLimit-Reset: 1762245120
Retry-After: 30
```

A `429` body uses `RATE_LIMITED` and states the window in `message`.

---

## 2. Endpoint index

| Method | Path | Auth | Purpose | Nitro handler |
|---|---|---|---|---|
| GET | `/api/v1/me` | Session/Key | Current user, orgs, role | `server/api/v1/me.get.ts` |
| GET | `/api/v1/org` | Session/Key | Organisation profile and settings | `server/api/v1/org/index.get.ts` |
| PATCH | `/api/v1/org` | Owner/Admin | Update org settings | `server/api/v1/org/index.patch.ts` |
| GET | `/api/v1/org/members` | viewer+ | List members | `server/api/v1/org/members/index.get.ts` |
| POST | `/api/v1/org/members` | Owner/Admin | Invite member | `server/api/v1/org/members/index.post.ts` |
| PATCH | `/api/v1/org/members/:userId` | Owner/Admin | Change role | `server/api/v1/org/members/[userId].patch.ts` |
| DELETE | `/api/v1/org/members/:userId` | Owner/Admin | Remove member | `server/api/v1/org/members/[userId].delete.ts` |
| GET | `/api/v1/repos` | viewer+ | List connected repositories | `server/api/v1/repos/index.get.ts` |
| POST | `/api/v1/repos` | Admin | Connect/resolve a repository | `server/api/v1/repos/index.post.ts` |
| GET | `/api/v1/repos/:repoId` | viewer+ | Repository detail | `server/api/v1/repos/[repoId].get.ts` |
| DELETE | `/api/v1/repos/:repoId` | Admin | Disconnect repository | `server/api/v1/repos/[repoId].delete.ts` |
| GET | `/api/v1/repos/:repoId/scans` | viewer+ | Scans for a repository | `server/api/v1/repos/[repoId]/scans.get.ts` |
| POST | `/api/v1/scan` | Auditor+ | Start a scan | `server/api/v1/scan.post.ts` |
| GET | `/api/v1/scan/:scanId` | viewer+ | Scan status and score | `server/api/v1/scan/[scanId].get.ts` |
| GET | `/api/v1/scans` | viewer+ | List scans | `server/api/v1/scans.get.ts` |
| POST | `/api/v1/scan/:scanId/cancel` | Auditor+ | Cancel a queued/running scan | `server/api/v1/scan/[scanId]/cancel.post.ts` |
| GET | `/api/v1/scan/:scanId/findings` | viewer+ | List findings | `server/api/v1/scan/[scanId]/findings.get.ts` |
| GET | `/api/v1/scan/:scanId/events` | viewer+ | Scan timeline | `server/api/v1/scan/[scanId]/events.get.ts` |
| PATCH | `/api/v1/findings/:findingId` | Auditor+ | Triage a finding | `server/api/v1/findings/[findingId].patch.ts` |
| POST | `/api/v1/report/pdf` | Auditor+ | Request a PDF | `server/api/v1/report/pdf.post.ts` |
| GET | `/api/v1/report/pdf/:reportId` | viewer+ | Report status and signed URL | `server/api/v1/report/pdf/[reportId].get.ts` |
| GET | `/api/v1/report/pdf/:reportId/download` | viewer+ | Redirect to signed URL | `server/api/v1/report/pdf/[reportId]/download.get.ts` |
| GET | `/api/v1/rules` | viewer+ | List DPDPA controls | `server/api/v1/rules/index.get.ts` |
| GET | `/api/v1/rules/:code` | viewer+ | Control detail and mappings | `server/api/v1/rules/[code].get.ts` |
| GET | `/api/v1/openapi.json` | None | OpenAPI 3.1 document (non-production; see §12) | `server/api/v1/openapi.json.get.ts` |
| GET | `/api/v1/audit-logs` | Admin | Audit trail | `server/api/v1/audit-logs.get.ts` |
| GET | `/api/v1/api-keys` | Admin | List API keys | `server/api/v1/api-keys/index.get.ts` |
| POST | `/api/v1/api-keys` | Owner | Create API key | `server/api/v1/api-keys/index.post.ts` |
| DELETE | `/api/v1/api-keys/:keyId` | Owner | Revoke API key | `server/api/v1/api-keys/[keyId].delete.ts` |
| POST | `/api/v1/webhooks/github` | HMAC | GitHub App webhooks | `server/api/v1/webhooks/github.post.ts` |
| GET | `/api/auth/github` | None | Start OAuth | `server/routes/auth/github.get.ts` |
| GET | `/api/auth/github/callback` | None | OAuth callback | `server/routes/auth/github/callback.get.ts` |
| POST | `/api/auth/logout` | Session | End session | `server/routes/auth/logout.post.ts` |

All handlers validate with Zod schemas from `packages/contracts`, verify authorisation, call the orchestrator, and map errors to the envelope. Handlers never contain domain logic.

---

## 3. Scan endpoints

### 3.1 Create a scan

`POST /api/v1/scan`

**Headers**

```
Authorization: Bearer dpk_live_...
Idempotency-Key: 6f0c2f1e-7a3b-4c8d-9e10-1a2b3c4d5e6f
Content-Type: application/json
```

**Request** — exactly one of `repositoryId` or `githubUrl`:

```json
{
  "repositoryId": "repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3",
  "ref": "main",
  "profile": "standard"
}
```

```json
{
  "githubUrl": "https://github.com/acme/payments-service",
  "ref": "release/2026.11",
  "profile": "standard"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `repositoryId` | string | one-of | Must belong to the caller's org |
| `githubUrl` | string | one-of | Must be `https://github.com/<owner>/<repo>`; no credentials, query, or fragment |
| `ref` | string | no | Branch, tag, or 40/64-char SHA; defaults to the repository default branch |
| `profile` | enum | no | `standard` (all scanners) or `secrets-only`; default `standard` |

**Response — 202 Accepted**

```json
{
  "data": {
    "id": "scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
    "repositoryId": "repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3",
    "status": "queued",
    "ref": "main",
    "profile": "standard",
    "createdAt": "2026-11-04T09:31:22.481Z",
    "links": {
      "self": "/api/v1/scan/scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
      "findings": "/api/v1/scan/scn_01J8Z4A1B2C3D4E5F6G7H8J9K0/findings",
      "events": "/api/v1/scan/scn_01J8Z4A1B2C3D4E5F6G7H8J9K0/events"
    }
  },
  "meta": { "requestId": "req_01J8Z4A1..." }
}
```

**Headers on success**

```
Location: /api/v1/scan/scn_01J8Z4A1B2C3D4E5F6G7H8J9K0
Retry-After: 3
```

**Errors**

| Code | HTTP | Cause |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Missing both or both supplied; bad URL; bad ref |
| `REPO_NOT_ACCESSIBLE` | 403 | GitHub App installation cannot see the repo |
| `REPO_TOO_LARGE` | 422 | Above the plan size limit |
| `PLAN_LIMIT_EXCEEDED` | 402 | Scan quota exhausted |
| `SCAN_IN_PROGRESS` | 409 | An active scan already exists for this repo and ref |
| `IDEMPOTENCY_CONFLICT` | 422 | Key reused with a different body |

### 3.2 Get a scan

`GET /api/v1/scan/:scanId`

**Response — 200**

```json
{
  "data": {
    "id": "scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
    "repository": {
      "id": "repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3",
      "fullName": "acme/payments-service",
      "visibility": "private"
    },
    "status": "completed",
    "ref": "main",
    "commitSha": "9f2c1d7e4b8a6c0f3e2d1b0a9c8d7e6f5a4b3c2d",
    "score": 72.4,
    "grade": "C",
    "sectionScores": {
      "5": 85.0,
      "6": 61.5,
      "7": 90.0,
      "8(4)": 68.2,
      "8(5)": 75.0,
      "9": 100.0,
      "10": 80.0,
      "12": null,
      "13": 55.0,
      "16": 88.0
    },
    "counts": {
      "critical": 2,
      "high": 7,
      "medium": 14,
      "low": 9,
      "info": 3,
      "total": 35
    },
    "coverage": {
      "semgrep": "completed",
      "checkov": "completed",
      "gitleaks": "timed_out"
    },
    "scannerVersions": {
      "semgrep": "1.95.0",
      "checkov": "3.2.334",
      "gitleaks": "8.21.2"
    },
    "rulePackVersion": "2026.10.1",
    "scoringVersion": "1.0.0",
    "error": null,
    "timestamps": {
      "queuedAt": "2026-11-04T09:31:22.481Z",
      "startedAt": "2026-11-04T09:31:49.112Z",
      "completedAt": "2026-11-04T09:37:04.903Z",
      "durationMs": 322422
    },
    "links": {
      "findings": "/api/v1/scan/scn_01J8Z4A1B2C3D4E5F6G7H8J9K0/findings",
      "events": "/api/v1/scan/scn_01J8Z4A1B2C3D4E5F6G7H8J9K0/events",
      "report": "/api/v1/report/pdf"
    }
  }
}
```

`coverage` is authoritative. A `completed` scan with a non-`completed` scanner is **partial**; the UI must show a coverage warning and must not display a "clean" message.

A `null` section score means **not assessed** (`applicableWeight = 0`), never 100 — section 12 carries only a weight-0, non-scored control (rules.md §4/§9.2).

**Errors:** `404 NOT_FOUND` for another tenant's scan (never `403`, to avoid existence leaks).

### 3.3 List scans

`GET /api/v1/scans?repositoryId=repo_...&status=completed&from=2026-10-01&to=2026-11-01&page=1&pageSize=20&sort=-createdAt`

| Parameter | Type | Notes |
|---|---|---|
| `repositoryId` | string | Optional |
| `status` | enum | Repeatable: `status=completed&status=failed` |
| `from`, `to` | ISO date | Inclusive, max range 366 days |
| `page`, `pageSize` | integer | See pagination |
| `sort` | string | `createdAt`, `-createdAt`, `score`, `-score` |

**Response — 200**

```json
{
  "data": [
    {
      "id": "scn_01J8Z4A7B2C3D4E5F6G7H8J9K0",
      "repositoryId": "repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3",
      "repositoryFullName": "acme/payments-service",
      "status": "completed",
      "score": 68.9,
      "grade": "C",
      "counts": { "critical": 2, "high": 7, "medium": 14, "low": 9, "info": 3, "total": 35 },
      "createdAt": "2026-11-04T08:12:44.117Z",
      "completedAt": "2026-11-04T08:18:02.664Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "totalItems": 142, "totalPages": 8 }
}
```

This list example is a **different scan** from the §3.2 detail example (`scn_01J8Z4A7...` vs `scn_01J8Z4A1...`); counts in the two examples are independent.

### 3.4 Cancel a scan

`POST /api/v1/scan/:scanId/cancel`

```json
{ "reason": "Superseded by a newer commit" }
```

**Response — 202**

```json
{
  "data": {
    "id": "scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
    "status": "cancelled",
    "cancelledAt": "2026-11-04T09:33:10.001Z"
  }
}
```

Returns `409 INVALID_STATE_TRANSITION` if the scan is already terminal. Cancellation deletes the Job and Secret; the pod receives `SIGTERM` and has 30 seconds to exit.

### 3.5 Scan timeline

`GET /api/v1/scan/:scanId/events`

```json
{
  "data": [
    { "type": "queued", "at": "2026-11-04T09:31:22.481Z", "payload": {} },
    { "type": "job_created", "at": "2026-11-04T09:31:49.112Z", "payload": { "jobName": "scan-01j8z4a1" } },
    { "type": "clone_completed", "at": "2026-11-04T09:32:31.884Z", "payload": { "durationMs": 41800 } },
    { "type": "scanner_completed", "at": "2026-11-04T09:34:58.220Z", "payload": { "scanner": "semgrep", "findings": 22 } },
    { "type": "scanner_completed", "at": "2026-11-04T09:35:41.770Z", "payload": { "scanner": "checkov", "findings": 11 } },
    { "type": "scanner_timed_out", "at": "2026-11-04T09:36:50.003Z", "payload": { "scanner": "gitleaks" } },
    { "type": "completed", "at": "2026-11-04T09:37:04.903Z", "payload": { "score": 72.4 } }
  ]
}
```

Payloads never contain file contents or secret values.

---

## 4. Findings

### 4.1 List findings

`GET /api/v1/scan/:scanId/findings?severity=critical&severity=high&scanner=semgrep&section=8(4)&status=open&file=src/&q=logger&page=1&pageSize=50&sort=-severity`

| Parameter | Type | Notes |
|---|---|---|
| `severity` | enum, repeatable | `critical`, `high`, `medium`, `low`, `info` |
| `scanner` | enum, repeatable | `semgrep`, `checkov`, `gitleaks` |
| `section` | string, repeatable | `8(4)`, `6`, etc. |
| `status` | enum, repeatable | `open`, `false_positive`, `accepted_risk`, `fixed`, `reopened` |
| `file` | string | Prefix match on `file_path` |
| `q` | string | Full-text search over message and rule ID, max 200 chars |
| `sort` | string | `-severity`, `file`, `-lineStart`, `-createdAt` |

**Response — 200**

```json
{
  "data": [
    {
      "id": "fnd_01J8Z5B2C3D4E5F6G7H8J9K0M1",
      "scanId": "scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
      "scanner": "semgrep",
      "scannerRuleId": "python.lang.security.audit.logging-sensitive-data",
      "severity": "critical",
      "confidence": "direct",
      "status": "open",
      "isNew": true,
      "filePath": "services/payments/api/views.py",
      "lineStart": 142,
      "lineEnd": 149,
      "message": "Personal data is written to application logs.",
      "evidence": {
        "redacted": "logger.info(\"card=****4242 email=****@example.com\")",
        "hash": "sha256:5f2c...e91a"
      },
      "dpdpa": {
        "code": "DPDPA-8.4-LOG-01",
        "section": "8(4)",
        "title": "Personal data must not be exposed in logs",
        "severity": "critical",
        "rationale": "Logging personal data widens access beyond the purpose for which it was collected and fails the safeguards obligation."
      },
      "remediation": {
        "summary": "Remove the log statement or replace the value with a non-reversible token.",
        "steps": [
          "Delete the PII fields from the log call.",
          "If correlation is required, log a salted hash of the identifier.",
          "Add a lint rule to prevent regressions."
        ],
        "reference": "https://docs.example.com/rules/DPDPA-8.4-LOG-01"
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 50, "totalItems": 3, "totalPages": 1 }
}
```

Secret findings omit `evidence.redacted` entirely and set `"evidence": { "hash": "sha256:..." }`.

**Errors:** `404 NOT_FOUND` if the scan belongs to another org.

### 4.2 Triage a finding

`PATCH /api/v1/findings/:findingId`

```json
{
  "status": "false_positive",
  "note": "Test fixture; the value is a documented dummy key, not a live credential."
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | enum | yes | `open`, `false_positive`, `accepted_risk`, `fixed`, `reopened` |
| `note` | string | conditional | Required for `accepted_risk` (min 20 chars) and `false_positive` (min 10) |
| `externalUrl` | string | no | Ticket link; must be HTTPS |

**Response — 200**

```json
{
  "data": {
    "id": "fnd_01J8Z5B2C3D4E5F6G7H8J9K0M1",
    "status": "false_positive",
    "updatedAt": "2026-11-04T10:02:11.005Z",
    "triage": {
      "actor": "usr_01J8...",
      "note": "Test fixture; the value is a documented dummy key, not a live credential.",
      "at": "2026-11-04T10:02:11.005Z"
    }
  }
}
```

Triage writes a `remediation_logs` row and an `audit_logs` row in the same transaction.

---

## 5. Repositories

### 5.1 List repositories

`GET /api/v1/repos?page=1&pageSize=20&sort=-lastScannedAt`

```json
{
  "data": [
    {
      "id": "repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3",
      "fullName": "acme/payments-service",
      "visibility": "private",
      "defaultBranch": "main",
      "language": "Python",
      "sizeKb": 84210,
      "isArchived": false,
      "lastScannedAt": "2026-11-04T09:37:04.903Z",
      "latestScan": {
        "id": "scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
        "status": "completed",
        "score": 72.4,
        "grade": "C"
      }
    }
  ],
  "pagination": { "page": 1, "pageSize": 20, "totalItems": 8, "totalPages": 1 }
}
```

### 5.2 Connect a repository

`POST /api/v1/repos`

```json
{ "githubUrl": "https://github.com/acme/payments-service" }
```

or, for a repository already selected in the GitHub App installation:

```json
{ "installationId": 12345678, "githubRepoId": 987654321 }
```

**Response — 201**

```json
{
  "data": {
    "id": "repo_01J8Z3K4M5N6P7Q8R9S0T1U2V3",
    "fullName": "acme/payments-service",
    "defaultBranch": "main",
    "visibility": "private",
    "connectedAt": "2026-11-04T09:20:00.000Z"
  }
}
```

**Errors:** `REPO_NOT_ACCESSIBLE` (403), `REPO_ALREADY_CONNECTED` (409), `INSTALLATION_SUSPENDED` (409).

### 5.3 Repository detail and scans

`GET /api/v1/repos/:repoId` returns the repository plus `stats` (total scans, average score, last score, trend).

`GET /api/v1/repos/:repoId/scans` supports the same filters as `/api/v1/scans`, scoped to the repository.

### 5.4 Disconnect a repository

`DELETE /api/v1/repos/:repoId`

**Response — 204 No Content.**

Disconnection revokes future scans and schedules deletion of repository-derived data per the org retention policy. It does not delete GitHub data. If an active scan exists, returns `409 SCAN_IN_PROGRESS` unless `?force=true` is supplied by an owner.

---

## 6. Reports

### 6.1 Request a PDF

`POST /api/v1/report/pdf`

**Headers**

```
Idempotency-Key: 3d1b4a2c-5e6f-4a7b-8c9d-0e1f2a3b4c5d
Content-Type: application/json
```

```json
{
  "scanId": "scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
  "template": "standard"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `scanId` | string | yes | Must be `completed` or `failed` with findings |
| `template` | enum | no | `standard` (default), `executive` (Growth+) |

**Response — 202**

```json
{
  "data": {
    "id": "rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2",
    "scanId": "scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
    "status": "queued",
    "format": "pdf",
    "template": "standard",
    "createdAt": "2026-11-04T10:05:00.000Z",
    "links": { "self": "/api/v1/report/pdf/rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2" }
  }
}
```

**Errors:** `SCAN_NOT_READY` (409), `PLAN_LIMIT_EXCEEDED` (402), `IDEMPOTENCY_CONFLICT` (422).

### 6.2 Report status

`GET /api/v1/report/pdf/:reportId`

**Response — 200 (ready)**

```json
{
  "data": {
    "id": "rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2",
    "scanId": "scn_01J8Z4A1B2C3D4E5F6G7H8J9K0",
    "status": "ready",
    "format": "pdf",
    "sizeBytes": 482113,
    "sha256": "b7e2c1d0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2",
    "downloadUrl": "https://storage.example.com/reports/org_.../scn_.../rpt_....pdf?X-Amz-Signature=...",
    "expiresAt": "2026-11-04T10:20:00.000Z",
    "createdAt": "2026-11-04T10:05:00.000Z",
    "completedAt": "2026-11-04T10:05:06.342Z"
  }
}
```

While rendering:

```json
{ "data": { "id": "rpt_...", "status": "rendering", "createdAt": "..." } }
```

A failed report returns `status: "failed"` with a generic `error` message and a retry link; internal renderer errors are not exposed.

### 6.3 Download redirect

`GET /api/v1/report/pdf/:reportId/download`

Returns `302 Found` with `Location` set to a fresh signed URL valid for 15 minutes. The signed URL is never logged. If the report is not ready, returns `409 REPORT_NOT_READY`; if expired, `410 REPORT_EXPIRED`.

---

## 7. Rules and organisation

### 7.1 List DPDPA controls

`GET /api/v1/rules?section=8(4)&scanner=checkov&page=1&pageSize=50`

```json
{
  "data": [
    {
      "code": "DPDPA-8.4-ENC-01",
      "section": "8(4)",
      "title": "Encryption of personal data at rest",
      "summary": "Personal data stored in cloud storage must be encrypted at rest.",
      "obligation": "A Data Fiduciary must implement reasonable security safeguards to prevent a personal data breach.",
      "legalReference": "DPDPA Section 8(4)",
      "severity": "high",
      "weight": 5,
      "mappings": [
        { "scanner": "checkov", "ruleId": "CKV_AWS_19", "confidence": "direct" },
        { "scanner": "checkov", "ruleId": "CKV_AWS_16", "confidence": "direct" }
      ],
      "remediation": "Enable default encryption (SSE-KMS) on the bucket and rotate keys."
    }
  ],
  "pagination": { "page": 1, "pageSize": 50, "totalItems": 1, "totalPages": 1 }
}
```

### 7.2 Organisation

`GET /api/v1/org`

```json
{
  "data": {
    "id": "org_01J8Z2...",
    "name": "Acme Payments",
    "slug": "acme-payments",
    "plan": "growth",
    "dataRegion": "ap-south-1",
    "retentionDays": 90,
    "scanConcurrency": 3,
    "usage": {
      "scansThisMonth": 142,
      "scanLimit": 300,
      "seatsUsed": 8,
      "seatLimit": 15
    },
    "role": "admin"
  }
}
```

`PATCH /api/v1/org` accepts `name`, `retentionDays`, `settings.notifications`. Plan and region changes are billing operations and return `403` from this endpoint.

### 7.3 Members

`GET /api/v1/org/members` returns members with `userId`, `name`, `email`, `role`, `status`, `lastLoginAt`.

`POST /api/v1/org/members`

```json
{ "email": "priya@acme.example", "role": "auditor" }
```

Returns `201` with the membership; sends an invitation email. Existing users are added immediately; unknown emails remain `invited` for 7 days.

`PATCH /api/v1/org/members/:userId`

```json
{ "role": "admin" }
```

`DELETE /api/v1/org/members/:userId` returns `204`. Removing the last owner returns `409 LAST_OWNER`.

### 7.4 Audit logs

`GET /api/v1/audit-logs?action=scan.started&actorUserId=usr_...&from=...&to=...&page=1&pageSize=50`

```json
{
  "data": [
    {
      "id": 918273,
      "actor": { "type": "user", "id": "usr_01J8...", "name": "Priya Nair" },
      "action": "scan.started",
      "resource": { "type": "scan", "id": "scn_01J8Z4A1..." },
      "ip": "203.0.113.42",
      "userAgent": "Mozilla/5.0 ...",
      "metadata": { "repositoryId": "repo_01J8Z3K4..." },
      "createdAt": "2026-11-04T09:31:22.481Z"
    }
  ],
  "pagination": { "page": 1, "pageSize": 50, "totalItems": 1, "totalPages": 1 }
}
```

Only `owner` and `admin` can read audit logs. `metadata` is allowlisted per action and never contains tokens or code.

### 7.5 API keys

`POST /api/v1/api-keys`

```json
{ "name": "GitHub Actions — payments-service", "scopes": ["scan:write", "scan:read", "report:read"], "expiresAt": "2027-11-04T00:00:00.000Z" }
```

**Response — 201** (plaintext key shown once):

```json
{
  "data": {
    "id": "key_01J8Z7...",
    "name": "GitHub Actions — payments-service",
    "prefix": "dpk_live_7f3a",
    "scopes": ["scan:write", "scan:read", "report:read"],
    "key": "dpk_live_7f3a9c2e1b4d6f8a0c3e5b7d9f1a2c4e",
    "createdAt": "2026-11-04T10:10:00.000Z",
    "expiresAt": "2027-11-04T00:00:00.000Z"
  }
}
```

`GET /api/v1/api-keys` never returns `key`. `DELETE /api/v1/api-keys/:keyId` revokes immediately and returns `204`.

---

## 8. Authentication endpoints

| Method | Path | Behaviour |
|---|---|---|
| GET | `/api/auth/github` | Redirects to GitHub OAuth with `state` (PKCE + CSRF), scope `read:user user:email` only |
| GET | `/api/auth/github/callback` | Validates `state`, exchanges code, upserts user, creates session, redirects to `/app` or `/onboarding` |
| POST | `/api/auth/logout` | Clears the session cookie, returns `204` |
| GET | `/api/v1/me` | Returns user, memberships, active org, role, feature flags |

No repository scope is requested during OAuth. Repository access comes exclusively from the GitHub App installation.

---

## 9. GitHub webhooks

`POST /api/v1/webhooks/github`

**Headers**

```
X-GitHub-Event: installation_repositories
X-GitHub-Delivery: 72d3162e-cc78-11e3-81ab-4c9367dc0958
X-Hub-Signature-256: sha256=...
```

**Processing**

1. Read the raw body (max 1 MB) before JSON parsing.
2. Verify `X-Hub-Signature-256` with the webhook secret using a constant-time comparison.
3. Reject deliveries older than 5 minutes or already-seen `X-GitHub-Delivery` IDs.
4. Handle `installation.created`, `installation.deleted`, `installation.suspend`, `installation.unsuspend`, `installation_repositories.added`, `installation_repositories.removed`, `repository.renamed`, `repository.transferred`.
5. Return `202` after enqueueing; process asynchronously.

**Response**

```json
{ "data": { "accepted": true, "deliveryId": "72d3162e-cc78-11e3-81ab-4c9367dc0958" } }
```

Invalid signatures return `401` with no detail. Webhook handling never trusts the payload's account identifiers without cross-checking the stored installation ID.

---

## 10. Internal orchestrator API

Internal endpoints are not reachable from the internet. They require HMAC plus network policy.

### 10.1 Authentication

```
X-Internal-Key: <rotated shared key>
X-Internal-Timestamp: 1762245120
X-Internal-Signature: HMAC-SHA256(secret, timestamp + "." + rawBody)
X-Request-Id: req_...
X-Org-Id: org_...
X-User-Id: usr_...
```

Reject if the timestamp is more than 300 seconds from server time, the signature mismatches, or `X-Org-Id` does not match the resource.

### 10.2 Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/internal/v1/scans` | Create or return a scan by idempotency key |
| GET | `/internal/v1/scans/:scanId` | Scan detail for Nitro |
| POST | `/internal/v1/scans/:scanId/cancel` | Cancel and delete the Job |
| POST | `/internal/v1/scans/:scanId/findings` | Runner batch callback |
| POST | `/internal/v1/scans/:scanId/complete` | Runner final callback |
| GET | `/internal/v1/reports/:reportId/view-model` | Renderer data |
| POST | `/internal/v1/reports/:reportId/complete` | Renderer completion |
| POST | `/internal/v1/repos/resolve` | Resolve a GitHub URL to a repository |
| GET | `/internal/v1/health` | Liveness/readiness |

### 10.3 Create scan

`POST /internal/v1/scans`

```json
{
  "orgId": "org_01J8Z2...",
  "repositoryId": "repo_01J8Z3K4...",
  "requestedBy": "usr_01J8...",
  "apiKeyId": null,
  "ref": "main",
  "profile": "standard",
  "idempotencyKey": "6f0c2f1e-7a3b-4c8d-9e10-1a2b3c4d5e6f",
  "requestId": "req_01J8Z4A1..."
}
```

**Response — 202**

```json
{
  "data": {
    "scanId": "scn_01J8Z4A1...",
    "status": "queued",
    "createdAt": "2026-11-04T09:31:22.481Z",
    "replayed": false
  }
}
```

### 10.4 Runner findings callback

`POST /internal/v1/scans/:scanId/findings`

```json
{
  "batchId": "bat_01J8Z5...",
  "scanner": "semgrep",
  "scannerVersion": "1.95.0",
  "findings": [
    {
      "scannerRuleId": "python.lang.security.audit.logging-sensitive-data",
      "scannerRuleVersion": "1.95.0",
      "severity": "critical",
      "filePath": "services/payments/api/views.py",
      "lineStart": 142,
      "lineEnd": 149,
      "message": "Personal data is written to application logs.",
      "evidenceRedacted": "logger.info(\"card=****4242\")",
      "evidenceHash": "sha256:5f2c...e91a",
      "fingerprint": "fpt_9a8b7c6d5e4f3a2b1c0d",
      "context": { "framework": "django", "language": "python" }
    }
  ]
}
```

**Response — 200**

```json
{ "data": { "accepted": 1, "duplicates": 0 } }
```

Limits: 500 findings or 1 MB per batch; 100 batches per scan. Exceeding a limit returns `413 PAYLOAD_TOO_LARGE` or `429 RATE_LIMITED`.

### 10.5 Runner completion callback

`POST /internal/v1/scans/:scanId/complete`

```json
{
  "scanners": [
    { "name": "semgrep", "status": "completed", "version": "1.95.0", "durationMs": 118400, "findings": 22 },
    { "name": "checkov", "status": "completed", "version": "3.2.334", "durationMs": 42700, "findings": 11 },
    { "name": "gitleaks", "status": "timed_out", "version": "8.21.2", "durationMs": 60000, "findings": 0 }
  ],
  "commitSha": "9f2c1d7e4b8a6c0f3e2d1b0a9c8d7e6f5a4b3c2d",
  "workspaceBytes": 84210112
}
```

Orchestrator recomputes coverage, maps findings, scores, and returns `200`.

### 10.6 Report view model

`GET /internal/v1/reports/:reportId/view-model` returns the full report payload: org branding, scan metadata, score, section scores, coverage, top findings (maximum 200), counts by severity, methodology, rule-pack version, disclaimer. It never includes source code or secret values.

---

## 11. Error codes

| Code | HTTP | Retryable | Meaning |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | No | Schema or semantic validation failed |
| `UNAUTHENTICATED` | 401 | No | Missing or invalid session/API key |
| `FORBIDDEN` | 403 | No | Insufficient role or scope |
| `NOT_FOUND` | 404 | No | Resource absent or not visible to the org |
| `CONFLICT` | 409 | No | Duplicate or invalid state transition |
| `INVALID_STATE_TRANSITION` | 409 | No | Operation not allowed in the resource's current status (e.g. cancel a terminal scan) |
| `LAST_OWNER` | 409 | No | Refused removal or demotion of the organisation's last owner |
| `REPO_ALREADY_CONNECTED` | 409 | No | Repository URL already saved for this organisation |
| `SCAN_IN_PROGRESS` | 409 | Yes, later | Active scan exists for repo/ref |
| `SCAN_NOT_READY` | 409 | Yes, later | Report requested before scan completion |
| `REPORT_NOT_READY` | 409 | Yes, later | PDF still rendering |
| `REPORT_EXPIRED` | 410 | No | Report past retention |
| `IDEMPOTENCY_CONFLICT` | 422 | No | Key reused with a different payload |
| `PLAN_LIMIT_EXCEEDED` | 402 | No | Quota or seat limit reached |
| `REPO_NOT_ACCESSIBLE` | 403 | No | GitHub App cannot access the repo |
| `REPO_TOO_LARGE` | 422 | No | Above the plan size limit |
| `INSTALLATION_SUSPENDED` | 409 | No | GitHub App installation suspended |
| `PAGINATION_LIMIT` | 422 | No | Offset beyond 10,000 |
| `RATE_LIMITED` | 429 | Yes, after `Retry-After` | Limit exceeded |
| `PAYLOAD_TOO_LARGE` | 413 | No | Body or batch too large |
| `UPSTREAM_UNAVAILABLE` | 503 | Yes | Database, Redis, or GitHub unavailable |
| `INTERNAL_ERROR` | 500 | Maybe | Unexpected server error; request ID required for support |

---

## 12. Versioning and compatibility

- `/api/v1` is stable. Additive fields are non-breaking and may appear without notice.
- Removing or changing a field requires `/api/v2` and a 6-month deprecation window with `Deprecation` and `Sunset` headers.
- Enum values may be added; clients must tolerate unknown values and render a fallback.
- Error `code` values are stable; `message` text is not part of the contract.
- Webhook payloads follow GitHub's schema and are passed through with a stable envelope.
- The OpenAPI 3.1 document is generated from `packages/contracts` and published at `/api/v1/openapi.json` in non-production; production publishes it to the developer docs site.

---

## 13. Example: CI integration

```yaml
- name: DPDPA scan
  run: |
    SCAN=$(curl -sS -X POST "$API/api/v1/scan" \
      -H "Authorization: Bearer $DPDPA_API_KEY" \
      -H "Idempotency-Key: $GITHUB_SHA" \
      -H "Content-Type: application/json" \
      -d "{\"githubUrl\":\"$GITHUB_SERVER_URL/$GITHUB_REPOSITORY\",\"ref\":\"$GITHUB_SHA\"}")
    echo "$SCAN" | jq -r '.data.id' > scan_id

    for i in $(seq 1 120); do
      BODY=$(curl -sS "$API/api/v1/scan/$(cat scan_id)" -H "Authorization: Bearer $DPDPA_API_KEY")
      STATUS=$(echo "$BODY" | jq -r '.data.status')
      [ "$STATUS" = "completed" ] && break
      [ "$STATUS" = "failed" ] && exit 1
      sleep 5
    done

    SCORE=$(echo "$BODY" | jq -r '.data.score')
    echo "DPDPA score: $SCORE"
    [ "$(echo "$BODY" | jq -r '.data.counts.critical')" -eq 0 ] || exit 1
```

The CI example fails the build only on critical findings. Teams can raise the threshold with a query on `counts.high`.

#!/usr/bin/env bash
# Task 11 launch verification for the k3s internal pilot.
#
# Run from the repository root:
#   KUBECONFIG=/etc/rancher/k3s/k3s.yaml bash infra/scripts/signoff-check.sh
#
# This script is a real verification, not a dry run: it starts a fresh scan of
# https://github.com/Improwised/jovVix.git, creates a fresh report, logs in as a
# seeded account, rotates that account's temporary password, and performs a
# non-destructive Postgres restore drill. Secrets are read from Kubernetes
# Secrets and are never printed.
#
# Optional overrides:
#   DPDPA_BASE_URL, DPDPA_CA_CERT, DPDPA_ORG_ID, DPDPA_SEED_EMAIL,
#   DPDPA_SEED_PASSWORD (for re-runs after rotation),
#   DPDPA_SCAN_TIMEOUT_SECONDS, DPDPA_REPORT_TIMEOUT_SECONDS,
#   DPDPA_POLL_INTERVAL_SECONDS, DPDPA_ORCHESTRATOR_LOCAL_PORT.
set -euo pipefail

REPO_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$REPO_ROOT"

BASE_URL=${DPDPA_BASE_URL:-https://dpdpa.pride.improwised.dev}
CA_CERT=${DPDPA_CA_CERT:-infra/certs/ca.crt}
ORCH_LOCAL_PORT=${DPDPA_ORCHESTRATOR_LOCAL_PORT:-18001}
ORCH_URL="http://127.0.0.1:${ORCH_LOCAL_PORT}"
TARGET_REPO_URL='https://github.com/Improwised/jovVix.git'
TARGET_REPO_FULL_NAME='Improwised/jovVix'
EXPECTED_PACK='dpdpa-2026.10.6'
EXPECTED_SCANNERS=(semgrep checkov gitleaks)
SCAN_TIMEOUT=${DPDPA_SCAN_TIMEOUT_SECONDS:-900}
REPORT_TIMEOUT=${DPDPA_REPORT_TIMEOUT_SECONDS:-180}
POLL_INTERVAL=${DPDPA_POLL_INTERVAL_SECONDS:-10}
RESTORE_POD='pg-restore-drill-signoff'

TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/dpdpa-signoff.XXXXXX")
COOKIE_JAR="$TMP_DIR/cookies.txt"
ROTATED_JAR="$TMP_DIR/cookies-rotated.txt"
PDF_FILE="$TMP_DIR/report.pdf"

FAILURES=0
PASSES=0
FAILED_LABELS=()
DETAIL=''
ORCH_PF_PID=''
ORG_ID=''
USER_ID=''
HMAC_KEY=''
INTERNAL_KEY=''
SEED_EMAIL=''
SEED_PASSWORD=''
SEED_ORG_SLUG=''
SEED_ROLE=''
SCAN_ID=''
REPORT_ID=''
PDF_SHA=''
API_STATUS=''
IDEMPOTENCY_UUID='' # gitleaks:allow
INTERNAL_SESSION_ID=''
PUBLIC_LOGIN_OK=false
RESTORE_POD_CREATED=false

cleanup() {
  if [ -n "$ORCH_PF_PID" ]; then
    kill "$ORCH_PF_PID" 2>/dev/null || true
  fi
  # Only remove the drill Pod this run created; never touch a pre-existing one.
  if command -v kubectl >/dev/null 2>&1 && [ "$RESTORE_POD_CREATED" = true ]; then
    kubectl -n dpdpa delete pod "$RESTORE_POD" --ignore-not-found >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Result helpers: every check prints PASS/FAIL and failures are accumulated.
# ---------------------------------------------------------------------------

note() { DETAIL="$*"; }

pass() {
  local label=$1
  printf 'PASS %s\n' "$label"
  [ -n "$DETAIL" ] && printf '     %s\n' "$DETAIL"
  DETAIL=''
  PASSES=$((PASSES + 1))
}

failing() {
  local label=$1
  printf 'FAIL %s\n' "$label"
  [ -n "$DETAIL" ] && printf '     %s\n' "$DETAIL"
  DETAIL=''
  FAILURES=$((FAILURES + 1))
  FAILED_LABELS+=("$label")
}

check() {
  local label=$1
  local rc
  shift
  DETAIL=''
  set +e
  "$@"
  rc=$?
  set -e
  if [ "$rc" -eq 0 ]; then
    pass "$label"
  else
    failing "$label"
  fi
}

skip_gate() {
  local label=$1 reason=$2
  note "$reason"
  failing "$label"
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    note "required command not found: $1"
    return 1
  }
}

uuid() {
  cat /proc/sys/kernel/random/uuid
}

# ---------------------------------------------------------------------------
# Orchestrator internal API (docs/api.md §10.1). All calls are HMAC signed with
# ${timestamp}.${rawBody}; GET requests sign an empty body ("${timestamp}.").
# ---------------------------------------------------------------------------

api_call() {
  local method=$1 path=$2 expected=$3 body=${4:-}
  local timestamp signature status
  local -a curl_args

  timestamp=$(date -u +%s)
  if [ -n "$body" ]; then
    printf '%s' "$body" >"$TMP_DIR/api-request.json"
    signature=$(printf '%s' "${timestamp}.${body}" | openssl dgst -sha256 -hmac "$HMAC_KEY" -hex | awk '{print $NF}')
  else
    signature=$(printf '%s' "${timestamp}." | openssl dgst -sha256 -hmac "$HMAC_KEY" -hex | awk '{print $NF}')
  fi

  curl_args=(
    curl -sS --max-time 30 -o "$TMP_DIR/api-response.json" -w '%{http_code}'
    -X "$method" "${ORCH_URL}${path}"
    -H "accept: application/json"
    -H "x-internal-key: ${INTERNAL_KEY}"
    -H "x-internal-timestamp: ${timestamp}"
    -H "x-internal-signature: ${signature}"
  )
  [ -n "$ORG_ID" ] && curl_args+=(-H "x-org-id: ${ORG_ID}")
  [ -n "$USER_ID" ] && curl_args+=(-H "x-user-id: ${USER_ID}")
  [ -n "$IDEMPOTENCY_UUID" ] && curl_args+=(-H "idempotency-key: ${IDEMPOTENCY_UUID}")
  if [ -n "$body" ]; then
    curl_args+=(-H 'content-type: application/json' --data-binary "@${TMP_DIR}/api-request.json")
  fi

  if ! status=$("${curl_args[@]}"); then
    note "orchestrator ${method} ${path} failed at the transport layer"
    return 1
  fi
  API_STATUS=$status
  if [ "$status" != "$expected" ]; then
    note "orchestrator ${method} ${path} returned HTTP ${status} (expected ${expected})"
    return 1
  fi
  if ! jq -e . "$TMP_DIR/api-response.json" >/dev/null 2>&1; then
    note "orchestrator ${method} ${path} returned a non-JSON body"
    return 1
  fi
  return 0
}

# ---------------------------------------------------------------------------
# Setup checks.
# ---------------------------------------------------------------------------

preflight_tools() {
  local cmd
  for cmd in kubectl curl jq openssl base64 sha256sum pdfinfo pdftotext mktemp; do
    require_cmd "$cmd" || return 1
  done
  [ -f "$CA_CERT" ] || {
    note "CA certificate not found at ${CA_CERT}"
    return 1
  }
  note "CLI tools and ${CA_CERT} present"
}

load_secrets() {
  HMAC_KEY=$(kubectl -n dpdpa get secret dpdpa-app-secrets -o jsonpath='{.data.ORCHESTRATOR_HMAC_KEY}' | base64 -d)
  INTERNAL_KEY=$(kubectl -n dpdpa get secret dpdpa-app-secrets -o jsonpath='{.data.ORCHESTRATOR_INTERNAL_KEY}' | base64 -d)
  if [ -z "$HMAC_KEY" ] || [ -z "$INTERNAL_KEY" ]; then
    note "Secret dpdpa-app-secrets is missing ORCHESTRATOR_HMAC_KEY/ORCHESTRATOR_INTERNAL_KEY"
    return 1
  fi

  local seed_json
  seed_json=$(kubectl -n dpdpa get secret dpdpa-seed-users -o jsonpath='{.data.SEED_USERS_JSON}' | base64 -d)
  if [ -z "$seed_json" ] || ! jq -e 'type == "array" and length > 0' <<<"$seed_json" >/dev/null 2>&1; then
    note "Secret dpdpa-seed-users has no usable SEED_USERS_JSON (it may have been removed after seeding)"
    return 1
  fi

  SEED_EMAIL=$(jq -r --arg wanted "${DPDPA_SEED_EMAIL:-}" \
    '[.[] | select($wanted == "" or .email == $wanted)] | .[0] // empty | .email // empty' <<<"$seed_json")
  SEED_PASSWORD=$(jq -r --arg wanted "${DPDPA_SEED_EMAIL:-}" \
    '[.[] | select($wanted == "" or .email == $wanted)] | .[0] // empty | .password // empty' <<<"$seed_json")
  SEED_ORG_SLUG=$(jq -r --arg wanted "${DPDPA_SEED_EMAIL:-}" \
    '[.[] | select($wanted == "" or .email == $wanted)] | .[0] // empty | .orgSlug // empty' <<<"$seed_json")
  SEED_ROLE=$(jq -r --arg wanted "${DPDPA_SEED_EMAIL:-}" \
    '[.[] | select($wanted == "" or .email == $wanted)] | .[0] // empty | .role // empty' <<<"$seed_json")

  if [ -z "$SEED_EMAIL" ] || [ -z "$SEED_PASSWORD" ] || [ -z "$SEED_ORG_SLUG" ]; then
    note "could not select a seeded account from SEED_USERS_JSON"
    return 1
  fi

  # Re-run support: after rotation the deploy-time password is stale.
  SEED_PASSWORD=${DPDPA_SEED_PASSWORD:-$SEED_PASSWORD}
  note "loaded pilot secrets and selected a seeded ${SEED_ROLE} account (values not printed)"
}

# A successful rotation is permanent. A later sign-off run must start from the
# deploy-time temporary credential so the forced-rotation gate is exercised
# again; this only touches the seeded pilot account.
reset_seed_password() {
  local hash sql
  [[ "$SEED_EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || {
    note "seeded email is not safe for a SQL query"
    return 1
  }
  hash=$(kubectl -n dpdpa exec deploy/orchestrator -- /nodejs/bin/node -e '
    const argon2 = require("/app/node_modules/.pnpm/argon2@0.43.1/node_modules/argon2");
    argon2
      .hash(process.argv[1], {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      })
      .then((h) => process.stdout.write(h))
      .catch((e) => {
        console.error(e.message);
        process.exit(1);
      });
  ' "$SEED_PASSWORD") || {
    note "could not hash the deploy-time seeded password"
    return 1
  }
  [[ "$hash" == \$argon2id\$* ]] || {
    note "unexpected argon2 hash returned by the orchestrator"
    return 1
  }
  sql=$(printf "UPDATE users SET password_hash='%s', must_change_password = TRUE WHERE email = '%s';" \
    "$hash" "$SEED_EMAIL")
  printf '%s\n' "$sql" | kubectl -n dpdpa exec -i deploy/postgres -- \
    psql -U dpdpa -d dpdpa_auditor -v ON_ERROR_STOP=1 >/dev/null || {
    note "could not reset the seeded pilot password for a fresh rotation gate"
    return 1
  }
  note "seeded pilot password reset to the deploy-time value for a fresh rotation gate"
}

start_port_forward() {
  note "port-forwarding svc/orchestrator to 127.0.0.1:${ORCH_LOCAL_PORT}"
  kubectl -n dpdpa port-forward "svc/orchestrator" "${ORCH_LOCAL_PORT}:3001" >"$TMP_DIR/port-forward.log" 2>&1 &
  ORCH_PF_PID=$!
  for _ in $(seq 1 30); do
    if curl -sS --max-time 2 -o /dev/null "${ORCH_URL}/health"; then
      note "orchestrator reachable through 127.0.0.1:${ORCH_LOCAL_PORT}"
      return 0
    fi
    if ! kill -0 "$ORCH_PF_PID" 2>/dev/null; then
      note "port-forward exited before becoming ready"
      return 1
    fi
    sleep 1
  done
  note "port-forward did not become ready within 30s"
  return 1
}

internal_password_login() {
  local body
  body=$(jq -nc --arg email "$SEED_EMAIL" --arg password "$SEED_PASSWORD" \
    '{email:$email,password:$password,userAgent:"dpdpa-signoff-check"}')
  api_call POST /internal/v1/identity/password/login 200 "$body" || return 1
  cp "$TMP_DIR/api-response.json" "$TMP_DIR/internal-login.json"
  USER_ID=$(jq -r '.data.user.id // empty' "$TMP_DIR/internal-login.json")
  local session_id
  session_id=$(jq -r '.data.sessionId // empty' "$TMP_DIR/internal-login.json")
  if [ -z "$USER_ID" ] || [ -z "$session_id" ]; then
    note "internal password login did not return a user id and session id"
    return 1
  fi
  INTERNAL_SESSION_ID=$session_id
  return 0
}

discover_org_id() {
  if [ -n "${DPDPA_ORG_ID:-}" ]; then
    ORG_ID=$DPDPA_ORG_ID
    note "organisation id supplied via DPDPA_ORG_ID"
    return 0
  fi

  # Preferred: the internal organisation listing, if this build exposes it.
  if api_call GET /internal/v1/orgs 200; then
    ORG_ID=$(jq -r --arg slug "$SEED_ORG_SLUG" \
      '[.data[]? | select(.slug == $slug)] | .[0].id // empty' "$TMP_DIR/api-response.json")
    [ -n "$ORG_ID" ] || ORG_ID=$(jq -r '.data[0].id // empty' "$TMP_DIR/api-response.json")
    if [ -n "$ORG_ID" ]; then
      if [ -z "$USER_ID" ]; then
        internal_password_login || return 1
      fi
      note "organisation id discovered from /internal/v1/orgs"
      return 0
    fi
  fi

  # Fallback: resolve the seeded user's active memberships from its session.
  internal_password_login || return 1
  api_call GET "/internal/v1/identity/sessions/${INTERNAL_SESSION_ID}" 200 || return 1
  ORG_ID=$(jq -r --arg slug "$SEED_ORG_SLUG" \
    '[.data.memberships[]? | select(.organization.slug == $slug)] | .[0].orgId // empty' \
    "$TMP_DIR/api-response.json")
  [ -n "$ORG_ID" ] || ORG_ID=$(jq -r '.data.memberships[0].orgId // empty' "$TMP_DIR/api-response.json")
  if [ -z "$ORG_ID" ]; then
    note "no organisation found for the seeded account; set DPDPA_ORG_ID explicitly"
    return 1
  fi
  local resolved_user
  resolved_user=$(jq -r '.data.user.id // empty' "$TMP_DIR/api-response.json")
  [ -n "$resolved_user" ] && USER_ID=$resolved_user
  note "organisation id discovered from the seeded account's session"
}

# ---------------------------------------------------------------------------
# Gate 2: fresh real scan with Standard profile and blank ref (default branch).
# ---------------------------------------------------------------------------

# A prior run can leave a queued/scanning Job holding the one-scan-at-a-time
# slot. Cancel those stale scans before reserving the sign-off scan.
cancel_stale_scans() {
  local body id cancelled=0 path
  api_call GET '/internal/v1/scans?status=queued&status=cloning&status=scanning&status=mapping&pageSize=100' 200 || return 1
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    body=$(jq -nc '{reason:"superseded by k3s launch sign-off"}')
    api_call POST "/internal/v1/scans/${id}/cancel" 202 "$body" || {
      note "could not cancel stale scan ${id}"
      return 1
    }
    cancelled=$((cancelled + 1))
  done < <(jq -r '.data.items[]? | .id // empty' "$TMP_DIR/api-response.json")
  note "cancelled ${cancelled} stale active scan(s)"
}

verify_fresh_scan() {
  local body idempotency_key status deadline repo_id default_branch scan_ref full_name
  cancel_stale_scans || return 1
  idempotency_key=$(uuid)
  body=$(jq -nc --arg org "$ORG_ID" --arg repo "$TARGET_REPO_URL" --arg user "$USER_ID" --arg key "$idempotency_key" \
    '{orgId:$org,githubUrl:$repo,profile:"standard",requestedBy:(if $user == "" then null else $user end),idempotencyKey:$key}')
  IDEMPOTENCY_UUID=$idempotency_key
  if ! api_call POST /internal/v1/scans 202 "$body"; then
    IDEMPOTENCY_UUID=''
    note "could not start a fresh scan of ${TARGET_REPO_URL} (an active scan may already exist)"
    return 1
  fi
  IDEMPOTENCY_UUID=''
  SCAN_ID=$(jq -r '.data.scanId // empty' "$TMP_DIR/api-response.json")
  if [ -z "$SCAN_ID" ]; then
    note "scan creation returned no scanId"
    return 1
  fi

  deadline=$((SECONDS + SCAN_TIMEOUT))
  while :; do
    api_call GET "/internal/v1/scans/${SCAN_ID}" 200 || return 1
    cp "$TMP_DIR/api-response.json" "$TMP_DIR/scan.json"
    status=$(jq -r '.data.status // empty' "$TMP_DIR/scan.json")
    if [ "$status" = 'completed' ]; then
      break
    fi
    case "$status" in
      failed|cancelled|expired)
        note "scan ${SCAN_ID} ended as ${status}"
        return 1
        ;;
    esac
    if [ "$SECONDS" -ge "$deadline" ]; then
      note "scan ${SCAN_ID} did not complete within ${SCAN_TIMEOUT}s (last status: ${status:-unknown})"
      return 1
    fi
    sleep "$POLL_INTERVAL"
  done

  [ "$(jq -r '.data.rulePackVersion // empty' "$TMP_DIR/scan.json")" = "$EXPECTED_PACK" ] || {
    note "scan ${SCAN_ID} has rulePackVersion=$(jq -r '.data.rulePackVersion // empty' "$TMP_DIR/scan.json"), expected ${EXPECTED_PACK}"
    return 1
  }
  # Scan.counts intentionally holds severity counts only; unmapped findings
  # are a mapping-quality signal and are counted from the persisted rows.
  [[ "$SCAN_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || {
    note "scan id ${SCAN_ID:-empty} is not a UUID; refusing to query unmapped findings"
    return 1
  }
  local unmapped
  unmapped=$(kubectl -n dpdpa exec deploy/postgres -- psql -U dpdpa -d dpdpa_auditor -tAc \
    "SELECT count(*) FROM scanner_findings WHERE scan_id = '${SCAN_ID}' AND control_code IS NULL;" \
    2>/dev/null | tr -d '[:space:]') || unmapped=''
  [ "$unmapped" = '0' ] || {
    note "scan ${SCAN_ID} has ${unmapped:-unknown} unmapped findings"
    return 1
  }
  local scanner
  for scanner in "${EXPECTED_SCANNERS[@]}"; do
    [ "$(jq -r --arg s "$scanner" '.data.coverage[$s] // empty' "$TMP_DIR/scan.json")" = 'completed' ] || {
      note "scanner ${scanner} is not completed in scan ${SCAN_ID}"
      return 1
    }
  done

  full_name=$(jq -r '.data.repository.fullName // empty' "$TMP_DIR/scan.json")
  [ "$full_name" = "$TARGET_REPO_FULL_NAME" ] || {
    note "scan ${SCAN_ID} repository is ${full_name:-unknown}, expected ${TARGET_REPO_FULL_NAME}"
    return 1
  }

  # Blank ref means the orchestrator resolved the repository default branch.
  repo_id=$(jq -r '.data.repository.id // empty' "$TMP_DIR/scan.json")
  [ -n "$repo_id" ] || {
    note "scan ${SCAN_ID} has no repository id"
    return 1
  }
  api_call GET "/internal/v1/repos/${repo_id}" 200 || return 1
  default_branch=$(jq -r '.data.defaultBranch // empty' "$TMP_DIR/api-response.json")
  scan_ref=$(jq -r '.data.ref // empty' "$TMP_DIR/scan.json")
  [ -n "$default_branch" ] && [ "$scan_ref" = "$default_branch" ] || {
    note "scan ref ${scan_ref:-empty} does not match the default branch ${default_branch:-unknown}"
    return 1
  }

  # mapping_miss is a runtime quality signal; no scan event may report one.
  api_call GET "/internal/v1/scans/${SCAN_ID}/events" 200 || return 1
  cp "$TMP_DIR/api-response.json" "$TMP_DIR/scan-events.json"
  jq -e '([.data[] | select((.type // "") | ascii_downcase | contains("mapping_miss"))] | length) == 0' \
    "$TMP_DIR/scan-events.json" >/dev/null || {
    note "scan ${SCAN_ID} emitted a mapping_miss event"
    return 1
  }

  note "scan ${SCAN_ID}: profile=standard, blank ref resolved to ${scan_ref}, pack=${EXPECTED_PACK}, 0 unmapped, 3/3 scanners completed"
}

# ---------------------------------------------------------------------------
# Gate 1: a completed Job whose pod used RuntimeClass gvisor.
# ---------------------------------------------------------------------------

verify_gvisor_job() {
  local job runtime pod_runtime
  kubectl -n dpdpa-scanners get jobs -o json >"$TMP_DIR/jobs.json"
  # Newer k3s releases report SuccessCriteriaMet instead of Complete for a
  # finished Job; both mean the scanner pod ran to completion.
  # Bind the evidence to this sign-off's scan; an older finished Job must not
  # satisfy the gate and a stale Job must not make it fail.
  job="scan-${SCAN_ID}"
  jq -e --arg job "$job" \
    '[.items[] | select(.metadata.name == $job and any(.status.conditions[]?;
      (.type == "Complete" or .type == "SuccessCriteriaMet") and .status == "True"))] | length == 1' \
    "$TMP_DIR/jobs.json" >/dev/null || {
    note "Job ${job} is missing or not completed in namespace dpdpa-scanners"
    return 1
  }

  jq -e --arg job "$job" \
    '[.items[] | select(.metadata.name == $job) | .spec.template.spec.runtimeClassName] | any(. == "gvisor")' \
    "$TMP_DIR/jobs.json" >/dev/null || {
    note "Job ${job} does not request RuntimeClass gvisor in its pod template"
    return 1
  }

  kubectl -n dpdpa-scanners get pods -l "job-name=${job}" -o json >"$TMP_DIR/job-pods.json"
  pod_runtime=$(jq -r '[.items[].spec.runtimeClassName // empty] | unique | join(",")' "$TMP_DIR/job-pods.json")
  runtime=$(printf '%s' "$pod_runtime" | tr -d '[:space:]')
  [ "$runtime" = 'gvisor' ] || {
    note "pods for Job ${job} used RuntimeClass ${runtime:-none}"
    return 1
  }
  note "completed Job ${job} ran its pods with RuntimeClass gvisor"
}

# ---------------------------------------------------------------------------
# Report discovery via the internal API (no hardcoded report ids).
# ---------------------------------------------------------------------------

prepare_report() {
  local body idempotency_key status deadline
  idempotency_key=$(uuid)
  body=$(jq -nc --arg scan "$SCAN_ID" '{scanId:$scan,template:"standard"}')
  IDEMPOTENCY_UUID=$idempotency_key
  if ! api_call POST /internal/v1/reports 202 "$body"; then
    IDEMPOTENCY_UUID=''
    note "could not reserve a report for scan ${SCAN_ID}"
    return 1
  fi
  IDEMPOTENCY_UUID=''
  REPORT_ID=$(jq -r '.data.id // empty' "$TMP_DIR/api-response.json")
  if [ -z "$REPORT_ID" ]; then
    note "report creation returned no report id"
    return 1
  fi

  deadline=$((SECONDS + REPORT_TIMEOUT))
  while :; do
    api_call GET "/internal/v1/reports/${REPORT_ID}/status" 200 || return 1
    cp "$TMP_DIR/api-response.json" "$TMP_DIR/report-status.json"
    status=$(jq -r '.data.status // empty' "$TMP_DIR/report-status.json")
    [ "$status" = 'ready' ] && break
    [ "$status" = 'failed' ] && {
      note "report ${REPORT_ID} failed to render"
      return 1
    }
    if [ "$SECONDS" -ge "$deadline" ]; then
      note "report ${REPORT_ID} did not become ready within ${REPORT_TIMEOUT}s (last status: ${status:-unknown})"
      return 1
    fi
    sleep "$POLL_INTERVAL"
  done
  PDF_SHA=$(jq -r '.data.sha256 // empty' "$TMP_DIR/report-status.json")
  [ -n "$PDF_SHA" ] || {
    note "report API did not expose a sha256 for ${REPORT_ID}"
    return 1
  }
  note "report ${REPORT_ID} discovered from the API and ready (scan ${SCAN_ID})"
}

# ---------------------------------------------------------------------------
# Public web login (needed for report HTML and PDF download).
# ---------------------------------------------------------------------------

public_login() {
  local status
  jq -nc --arg email "$SEED_EMAIL" --arg password "$SEED_PASSWORD" \
    '{email:$email,password:$password}' >"$TMP_DIR/login-body.json"
  status=$(curl -sS --cacert "$CA_CERT" --max-time 60 \
    -o "$TMP_DIR/login-response.json" -c "$COOKIE_JAR" -w '%{http_code}' \
    -X POST "${BASE_URL}/api/auth/password/login" \
    -H 'content-type: application/json' --data-binary "@${TMP_DIR}/login-body.json") || {
    note "password login request failed at the transport layer"
    return 1
  }
  [ "$status" = '200' ] || {
    note "password login returned HTTP ${status}"
    return 1
  }
  jq -e '.ok == true and .mustChangePassword == true' "$TMP_DIR/login-response.json" >/dev/null || {
    note "login did not report mustChangePassword=true for the seeded account"
    return 1
  }
  PUBLIC_LOGIN_OK=true
  note "seeded ${SEED_ROLE} account logged in; mustChangePassword=true"
}

# ---------------------------------------------------------------------------
# Gate 3: accessible report HTML.
# ---------------------------------------------------------------------------

verify_report_html() {
  local status text="$TMP_DIR/report.text"
  status=$(curl -sS -L --cacert "$CA_CERT" --max-time 60 \
    -b "$ROTATED_JAR" -o "$TMP_DIR/report.html" -w '%{http_code}' \
    "${BASE_URL}/report/${REPORT_ID}") || {
    note "report page request failed at the transport layer"
    return 1
  }
  [ "$status" = '200' ] || {
    note "report page returned HTTP ${status}"
    return 1
  }

  # Flatten SSR markup and Vue fragment comments so text split across nodes
  # and HTML entities cannot produce a false negative.
  sed -e 's/<!--[^>]*-->//g' \
      -e 's/<[^>]*>/ /g' \
      -e 's/&mdash;/—/g' -e 's/&#8212;/—/g' \
      -e 's/&amp;/\&/g' -e 's/&quot;/"/g' \
      "$TMP_DIR/report.html" | tr -s '[:space:]' ' ' >"$text"

  grep -Fiq 'improwised/jovvix — dpdpa audit report' "$text" || {
    note "report heading is missing"
    return 1
  }
  grep -Fq 'Export PDF' "$text" || {
    note "Export PDF control is missing"
    return 1
  }
  grep -Fq 'by DPDPA Auditor.' "$text" || {
    note "report attribution is missing"
    return 1
  }
  grep -Fq 'Not assessed' "$text" || {
    note "unassessed-section marker is missing"
    return 1
  }
  note "report HTML contains the heading, Export PDF, attribution and 'Not assessed'"
}

# ---------------------------------------------------------------------------
# Gate 4: downloaded PDF (A4, non-blank, control codes, pack version, SHA-256).
# ---------------------------------------------------------------------------

download_pdf() {
  local status
  status=$(curl -sS -L --cacert "$CA_CERT" --max-time 120 \
    -b "$ROTATED_JAR" -o "$PDF_FILE" -w '%{http_code}' \
    "${BASE_URL}/api/v1/report/pdf/${REPORT_ID}/download") || {
    note "PDF download failed at the transport layer"
    return 1
  }
  [ "$status" = '200' ] || {
    note "PDF download returned HTTP ${status}"
    return 1
  }
  [ "$(head -c 5 "$PDF_FILE")" = '%PDF-' ] || {
    note "downloaded bytes are not a PDF"
    return 1
  }
  note "PDF downloaded for report ${REPORT_ID}"
}

verify_pdf_a4_no_blank_pages() {
  local pages page body
  pdfinfo "$PDF_FILE" >"$TMP_DIR/pdfinfo.txt" 2>/dev/null || {
    note "pdfinfo could not read the downloaded PDF"
    return 1
  }
  grep -Eq '^Page size:[[:space:]]+59[56](\.[0-9]+)?[[:space:]]+x[[:space:]]+84[12](\.[0-9]+)?' \
    "$TMP_DIR/pdfinfo.txt" || {
    note "PDF page size is not A4: $(grep '^Page size:' "$TMP_DIR/pdfinfo.txt" || true)"
    return 1
  }
  pages=$(awk '/^Pages:/{print $2; exit}' "$TMP_DIR/pdfinfo.txt")
  [[ "$pages" =~ ^[1-9][0-9]*$ ]] || {
    note "pdfinfo reported an invalid page count"
    return 1
  }
  for ((page = 1; page <= pages; page++)); do
    body=$(pdftotext -f "$page" -l "$page" "$PDF_FILE" - 2>/dev/null | tr -d '[:space:]')
    [ -n "$body" ] || {
      note "PDF page ${page} is blank"
      return 1
    }
  done
  note "$(grep '^Page size:' "$TMP_DIR/pdfinfo.txt" | sed 's/^ *//'); ${pages} non-blank page(s)"
}

verify_pdf_content() {
  pdftotext -layout "$PDF_FILE" "$TMP_DIR/report.txt" 2>/dev/null || {
    note "pdftotext could not extract the downloaded PDF"
    return 1
  }
  grep -Eq 'DPDPA-[0-9]+(\.[0-9]+)?-[A-Z0-9]+-[0-9]{2}' "$TMP_DIR/report.txt" || {
    note "PDF has no explicit DPDPA control code"
    return 1
  }
  grep -Fq "$EXPECTED_PACK" "$TMP_DIR/report.txt" || {
    note "PDF does not record rule-pack ${EXPECTED_PACK}"
    return 1
  }
  note "PDF contains DPDPA control codes and rule-pack ${EXPECTED_PACK}"
}

verify_pdf_sha256() {
  local actual
  actual=$(sha256sum "$PDF_FILE" | awk '{print $1}')
  [ "$actual" = "$PDF_SHA" ] || {
    note "PDF SHA-256 ${actual} does not match the report API"
    return 1
  }
  note "downloaded PDF SHA-256 matches the report API"
}

# ---------------------------------------------------------------------------
# Gate 5: password rotation is forced and login is audited per user.
# ---------------------------------------------------------------------------

verify_rotation_is_forced() {
  local status
  status=$(curl -sS --cacert "$CA_CERT" --max-time 30 \
    -b "$COOKIE_JAR" -o "$TMP_DIR/rotation-gate.json" -w '%{http_code}' \
    "${BASE_URL}/api/v1/audit-logs") || {
    note "pre-rotation API probe failed at the transport layer"
    return 1
  }
  [ "$status" = '403' ] || {
    note "expected HTTP 403 from /api/v1/audit-logs while mustChangePassword=true, got ${status}"
    return 1
  }
  note "protected APIs are blocked until the temporary password is rotated"
}

rotate_password() {
  local new_password body status
  new_password=$(openssl rand -base64 24 | tr -d '\n')
  # No trailing newline: the value stays in a private temp dir and is never echoed.
  printf '%s' "$new_password" >"$TMP_DIR/rotated-password"
  # Preserve the rotated credential in a private location for the live
  # Playwright UI verification after sign-off (never printed to logs).
  install -m 600 "$TMP_DIR/rotated-password" /tmp/opencode/dpdpa-rotated-password
  body=$(jq -nc --arg current "$SEED_PASSWORD" --arg next "$new_password" \
    '{currentPassword:$current,newPassword:$next}')
  printf '%s' "$body" >"$TMP_DIR/change-body.json"
  status=$(curl -sS --cacert "$CA_CERT" --max-time 60 \
    -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
    -o "$TMP_DIR/change-response.json" -w '%{http_code}' \
    -X POST "${BASE_URL}/api/auth/password/change" \
    -H 'content-type: application/json' --data-binary "@${TMP_DIR}/change-body.json") || {
    note "password change request failed at the transport layer"
    return 1
  }
  [ "$status" = '200' ] || {
    note "password change returned HTTP ${status}"
    return 1
  }
  jq -e '.ok == true' "$TMP_DIR/change-response.json" >/dev/null || {
    note "password change response was not ok"
    return 1
  }
  note "temporary password rotated for the seeded ${SEED_ROLE} account (new value not printed)"
}

verify_rotated_login() {
  local body status
  body=$(jq -nc --arg email "$SEED_EMAIL" --arg password "$(cat "$TMP_DIR/rotated-password")" \
    '{email:$email,password:$password}')
  printf '%s' "$body" >"$TMP_DIR/rotated-login-body.json"
  status=$(curl -sS --cacert "$CA_CERT" --max-time 60 \
    -o "$TMP_DIR/rotated-login.json" -c "$ROTATED_JAR" -w '%{http_code}' \
    -X POST "${BASE_URL}/api/auth/password/login" \
    -H 'content-type: application/json' --data-binary "@${TMP_DIR}/rotated-login-body.json") || {
    note "login with the rotated password failed at the transport layer"
    return 1
  }
  [ "$status" = '200' ] || {
    note "login with the rotated password returned HTTP ${status}"
    return 1
  }
  jq -e '.ok == true and .mustChangePassword == false' "$TMP_DIR/rotated-login.json" >/dev/null || {
    note "rotated account still requires a password change"
    return 1
  }
  install -m 600 "$ROTATED_JAR" /tmp/opencode/dpdpa-rotated-cookies.txt
  note "login with the rotated password succeeds and mustChangePassword=false"
}

verify_password_audit() {
  local api_hits db_hit sql
  if ! [[ "$USER_ID" =~ ^[0-9a-fA-F-]{36}$ ]]; then
    note "user id is not a UUID; refusing to build an audit query"
    return 1
  fi

  # The org-scoped internal audit API is checked first. Password-login rows are
  # recorded with orgId=null, so the authoritative fallback is the audit table.
  api_hits=0
  if api_call GET "/internal/v1/audit/audit-logs?action=auth.login&actorUserId=${USER_ID}&page=1&pageSize=50" 200; then
    api_hits=$(jq -r --arg uid "$USER_ID" \
      '[.data[] | select(.action == "auth.login" and .actor.id == $uid and .metadata.method == "password")] | length' \
      "$TMP_DIR/api-response.json")
  fi

  sql=$(printf "SELECT 1 FROM audit_logs WHERE actor_user_id = '%s' AND action = 'auth.login' AND metadata->>'method' = 'password' LIMIT 1;" "$USER_ID")
  db_hit=$(kubectl -n dpdpa exec deploy/postgres -- psql -U dpdpa -d dpdpa_auditor -tAc "$sql" 2>/dev/null | tr -d '[:space:]') || db_hit=''

  [ "$api_hits" -gt 0 ] || [ "$db_hit" = '1' ] || {
    note "no auth.login/method=password audit row for user ${USER_ID}"
    return 1
  }
  note "auth.login with method=password recorded for user ${USER_ID} (API rows: ${api_hits}, DB row: ${db_hit:-0})"
}

# ---------------------------------------------------------------------------
# Gate 6: non-destructive restore from the pg-backups PVC into a scratch DB.
# ---------------------------------------------------------------------------

verify_restore_drill() {
  local dump one users orgs
  kubectl -n dpdpa get pvc pg-backups >/dev/null || {
    note "PVC pg-backups is missing"
    return 1
  }
  if kubectl -n dpdpa get pod "$RESTORE_POD" >/dev/null 2>&1; then
    note "helper Pod ${RESTORE_POD} already exists; remove it before re-running"
    return 1
  fi

  kubectl -n dpdpa apply -f - >/dev/null <<YAML
apiVersion: v1
kind: Pod
metadata:
  name: ${RESTORE_POD}
  namespace: dpdpa
  labels:
    app.kubernetes.io/name: dpdpa
    app.kubernetes.io/component: signoff-restore-drill
spec:
  restartPolicy: Never
  nodeSelector:
    workload: scanner
  containers:
    - name: postgres
      image: postgres:16-alpine
      env:
        - name: POSTGRES_DB
          value: scratch
        - name: POSTGRES_USER
          value: dpdpa
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: dpdpa-secrets
              key: POSTGRES_PASSWORD
      volumeMounts:
        - name: backups
          mountPath: /backups
          readOnly: true
  volumes:
    - name: backups
      persistentVolumeClaim:
        claimName: pg-backups
YAML
  RESTORE_POD_CREATED=true

  kubectl -n dpdpa wait --for=condition=Ready "pod/${RESTORE_POD}" --timeout=180s >/dev/null || {
    note "restore-drill Pod did not become Ready"
    return 1
  }
  # Ready only means the container started; wait for the embedded server.
  local ready=false
  for _ in $(seq 1 60); do
    if kubectl -n dpdpa exec "$RESTORE_POD" -- pg_isready -U dpdpa -d scratch -q >/dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  [ "$ready" = true ] || {
    note "scratch Postgres did not become accepting connections"
    return 1
  }
  dump=$(kubectl -n dpdpa exec "$RESTORE_POD" -- \
    sh -c 'ls -1 /backups/dpdpa-*.sql.gz 2>/dev/null | sort | tail -n 1' 2>/dev/null | tr -d '\r') || dump=''
  [ -n "$dump" ] || {
    note "no dpdpa-*.sql.gz dump found on PVC pg-backups"
    return 1
  }
  # The dump preserves table ownership from the live DB; the scratch cluster
  # only creates POSTGRES_USER, so recreate the owner roles before restoring.
  for role in $( { kubectl -n dpdpa exec "$RESTORE_POD" -- sh -c 'gzip -dc "$1"' sh "$dump" \
    | grep -oE 'OWNER TO [^;]+|FOR ROLE [^ ]+|TO [a-z_]+' | awk '{print $NF}' | tr -d '"';
    printf '%s\n' dpdpa_migrate dpdpa_runtime; } | sort -u); do
    [ "$role" = dpdpa ] && continue
    kubectl -n dpdpa exec "$RESTORE_POD" -- \
      psql -U dpdpa -d scratch -c "CREATE ROLE \"$role\";" >/dev/null 2>&1 || true
  done

  if ! kubectl -n dpdpa exec -i "$RESTORE_POD" -- \
    sh -c 'gunzip -c "$1" | psql -U dpdpa -d scratch -v ON_ERROR_STOP=1' sh "$dump" \
    >"$TMP_DIR/restore.log" 2>&1; then
    note "restore of $(basename "$dump") failed: $(tail -n 3 "$TMP_DIR/restore.log" 2>/dev/null | tr '\n' ' ')"
    return 1
  fi

  one=$(kubectl -n dpdpa exec "$RESTORE_POD" -- psql -U dpdpa -d scratch -tAc 'SELECT 1;' 2>/dev/null | tr -d '[:space:]') || one=''
  [ "$one" = '1' ] || {
    note "SELECT 1 failed against the restored scratch database"
    return 1
  }
  # Prisma maps these models to lowercase table names in this deployment.
  users=$(kubectl -n dpdpa exec "$RESTORE_POD" -- psql -U dpdpa -d scratch -tAc 'SELECT count(*) FROM users;' 2>/dev/null | tr -d '[:space:]') || users=''
  orgs=$(kubectl -n dpdpa exec "$RESTORE_POD" -- psql -U dpdpa -d scratch -tAc 'SELECT count(*) FROM organizations;' 2>/dev/null | tr -d '[:space:]') || orgs=''
  [[ "$users" =~ ^[0-9]+$ ]] && [[ "$orgs" =~ ^[0-9]+$ ]] || {
    note "representative restored-table counts could not be read"
    return 1
  }
  note "restored $(basename "$dump") into scratch: SELECT 1=1, users rows=${users}, organizations rows=${orgs}"
}

# ---------------------------------------------------------------------------
# Execution.
# ---------------------------------------------------------------------------

check 'preflight: required tools and CA certificate' preflight_tools
if [ "$FAILURES" -gt 0 ]; then
  printf '\nRESULT: FAIL (preflight failed)\n'
  exit 1
fi

check 'setup: load pilot secrets' load_secrets
check 'setup: reset seeded pilot password' reset_seed_password
check 'setup: orchestrator port-forward' start_port_forward
check 'setup: discover organisation id' discover_org_id

if [ "$FAILURES" -gt 0 ]; then
  printf '\nRESULT: FAIL (setup failed; no gates were exercised)\n'
  exit 1
fi

check 'GATE 2: fresh jovVix scan (Standard, blank ref, 0 unmapped, 3/3 scanners)' verify_fresh_scan
check 'GATE 1: completed scanner Job used RuntimeClass gvisor' verify_gvisor_job

if [ -z "$SCAN_ID" ]; then
  skip_gate 'GATE 3: report HTML content' 'blocked: no scan id'
  skip_gate 'GATE 4: downloaded PDF checks' 'blocked: no scan id'
  skip_gate 'GATE 5: password login, rotation and audit' 'blocked: no scan id'
else
  check 'report: discovered from API and ready' prepare_report
  if [ -z "$REPORT_ID" ]; then
    skip_gate 'GATE 3: report HTML content' 'blocked: no report id'
    skip_gate 'GATE 4: downloaded PDF checks' 'blocked: no report id'
    skip_gate 'GATE 5: password login, rotation and audit' 'blocked: no report id'
  else
    check 'setup: seeded password login' public_login
    if [ "$PUBLIC_LOGIN_OK" != true ]; then
      skip_gate 'GATE 3: report HTML content' 'blocked: seeded password login failed'
      skip_gate 'GATE 4: downloaded PDF checks' 'blocked: seeded password login failed'
      skip_gate 'GATE 5: password login, rotation and audit' 'blocked: seeded password login failed'
    else
      # Rotation must happen before any other /api/v1 call: the session
      # middleware blocks them while mustChangePassword is true.
      check 'GATE 5a: mustChangePassword blocks protected APIs' verify_rotation_is_forced
      check 'GATE 5b: temporary password rotation succeeds' rotate_password
      if [ -s "$TMP_DIR/rotated-password" ]; then
        check 'GATE 5c: login with rotated password clears mustChangePassword' verify_rotated_login
      else
        skip_gate 'GATE 5c: login with rotated password clears mustChangePassword' 'blocked: rotation failed'
      fi

      if [ -s "$ROTATED_JAR" ]; then
        check 'GATE 3: report HTML heading, Export PDF, attribution and Not assessed' verify_report_html

        check 'GATE 4a: PDF downloaded from the report API' download_pdf
        if [ -s "$PDF_FILE" ]; then
          check 'GATE 4b: PDF is A4 with no blank pages' verify_pdf_a4_no_blank_pages
          check 'GATE 4c: PDF contains DPDPA control codes and rule-pack version' verify_pdf_content
          check 'GATE 4d: PDF SHA-256 matches the report API' verify_pdf_sha256
        else
          skip_gate 'GATE 4b: PDF is A4 with no blank pages' 'blocked: PDF download failed'
          skip_gate 'GATE 4c: PDF contains DPDPA control codes and rule-pack version' 'blocked: PDF download failed'
          skip_gate 'GATE 4d: PDF SHA-256 matches the report API' 'blocked: PDF download failed'
        fi
        check 'GATE 5d: auth.login with method=password is attributed to the user' verify_password_audit
      else
        skip_gate 'GATE 3: report HTML content' 'blocked: no rotated session'
        skip_gate 'GATE 4: downloaded PDF checks' 'blocked: no rotated session'
        skip_gate 'GATE 5d: auth.login with method=password is attributed to the user' 'blocked: no rotated session'
      fi
    fi
  fi
fi

check 'GATE 6: Postgres restore drill from pg-backups passes SELECT 1' verify_restore_drill

printf '\nSign-off record\n'
printf '  Scan ID:     %s\n' "${SCAN_ID:-not discovered}"
printf '  Report ID:   %s\n' "${REPORT_ID:-not discovered}"
printf '  PDF SHA-256: %s\n' "${PDF_SHA:-not verified}"
printf '  Gates:       gVisor Job, fresh scan, report HTML, PDF, password rotation, restore drill\n'
printf '  Checks:      %d passed, %d failed\n' "$PASSES" "$FAILURES"
if [ "$FAILURES" -gt 0 ]; then
  printf '  Failed:      %s\n' "${FAILED_LABELS[*]}"
  printf '\nRESULT: FAIL\n'
  exit 1
fi
printf '\nRESULT: PASS (all six sign-off gates verified)\n'

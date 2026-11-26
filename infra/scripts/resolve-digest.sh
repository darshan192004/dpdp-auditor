#!/usr/bin/env bash
# Resolve the pushed pilot image digests and pin them into the app manifests.
# Called by build-and-push.sh after all four images have been pushed.
#
# Prerequisites when run from a workstation:
#   - kubectl port-forward -n dpdpa svc/registry 5000:5000
#   - export REGISTRY_HOST=127.0.0.1:5000   (endpoint used for skopeo inspection)
#   - the Docker daemon's "insecure-registries" includes 127.0.0.1:5000
#   - skopeo and jq are installed
# MANIFEST_REGISTRY_HOST stays the in-cluster DNS name by default: pods must
# never be given a localhost registry reference. Re-running this script is safe;
# it replaces both the initial placeholders and any previous digest pins.
# This script reads no credentials and prints no secrets.
set -euo pipefail

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

REGISTRY_HOST="${REGISTRY_HOST:-registry.dpdpa.svc.cluster.local:5000}"
MANIFEST_REGISTRY_HOST="${MANIFEST_REGISTRY_HOST:-registry.dpdpa.svc.cluster.local:5000}"
IMAGE_TAG="${IMAGE_TAG:-1.0.0-pilot.1}"

ORCHESTRATOR_FILE="$REPO_ROOT/infra/k8s/dpdpa/apps/orchestrator.yaml"
RENDERER_FILE="$REPO_ROOT/infra/k8s/dpdpa/apps/renderer.yaml"
WEB_FILE="$REPO_ROOT/infra/k8s/dpdpa/apps/web.yaml"
MIGRATE_FILE="$REPO_ROOT/infra/k8s/dpdpa/jobs/migrate.yaml"
SEED_FILE="$REPO_ROOT/infra/k8s/dpdpa/jobs/seed-users.yaml"

require_cmd skopeo
require_cmd jq

digest_for() {
  local name="$1"
  local digest
  digest="$(skopeo inspect --tls-verify=false "docker://${REGISTRY_HOST}/dpdpa/${name}:${IMAGE_TAG}" | jq -er '.Digest')" \
    || die "cannot inspect dpdpa/$name:$IMAGE_TAG at $REGISTRY_HOST"
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || die "$name has invalid digest: $digest"
  printf '%s' "$digest"
}

# $1 = target YAML, $2 = repository fragment to pin, $3 = placeholder token,
# $4 = full digest reference to write, $5 = bare 64-hex digest.
write_pin() {
  local file="$1"
  local fragment="$2"
  local placeholder="$3"
  local ref="$4"
  local hex="$5"

  [[ -f "$file" ]] || die "missing $file (create the Task 8 manifests first)"

  # Handle ...@sha256:PLACEHOLDER, ...@PLACEHOLDER, image:PLACEHOLDER,
  # a bare placeholder, an old digest pin, and an old tag reference.
  # The @sha256: case must precede the generic tag case: "sha256:" itself
  # ends in a colon but is not an image tag.
  sed -i -E \
    -e "s#@sha256:${placeholder}#@sha256:${hex}#g" \
    -e "s#@${placeholder}#@sha256:${hex}#g" \
    -e "s#([A-Za-z0-9_.:/-]*/[A-Za-z0-9_.-]+):${placeholder}#\1@sha256:${hex}#g" \
    -e "s#${placeholder}#${ref}#g" \
    -e "s#(${fragment}@sha256:)[0-9a-f]{64}#\1${hex}#g" \
    -e "s#([A-Za-z0-9_.:/-]*/${fragment}):[A-Za-z0-9_.-]+#\1@sha256:${hex}#g" \
    "$file"

  grep -Eq "${fragment}@sha256:${hex}" "$file" \
    || die "failed to write the ${fragment} digest into $file"
  if grep -Fq "$placeholder" "$file"; then
    die "unresolved placeholder ${placeholder} in $file"
  fi
}

web_digest="$(digest_for web)"
orchestrator_digest="$(digest_for orchestrator)"
runner_digest="$(digest_for scan-runner)"
chromium_digest="$(digest_for chromium)"
web_ref="${MANIFEST_REGISTRY_HOST}/dpdpa/web@${web_digest}"
orchestrator_ref="${MANIFEST_REGISTRY_HOST}/dpdpa/orchestrator@${orchestrator_digest}"
runner_ref="${MANIFEST_REGISTRY_HOST}/dpdpa/scan-runner@${runner_digest}"
chromium_ref="${MANIFEST_REGISTRY_HOST}/dpdpa/chromium@${chromium_digest}"

write_pin "$ORCHESTRATOR_FILE" 'scan-runner' 'REPLACE_WITH_RUNNER_DIGEST' \
  "$runner_ref" "${runner_digest#sha256:}"
write_pin "$RENDERER_FILE" 'chromium' 'REPLACE_WITH_CHROMIUM_DIGEST' \
  "$chromium_ref" "${chromium_digest#sha256:}"
# These image references never had placeholders; an unused placeholder token
# makes write_pin replace any earlier tag reference without inserting a pin.
write_pin "$WEB_FILE" 'web' 'REPLACE_WITH_WEB_DIGEST_UNUSED' \
  "$web_ref" "${web_digest#sha256:}"
for file in "$ORCHESTRATOR_FILE" "$MIGRATE_FILE" "$SEED_FILE"; do
  write_pin "$file" 'orchestrator' 'REPLACE_WITH_ORCHESTRATOR_DIGEST_UNUSED' \
    "$orchestrator_ref" "${orchestrator_digest#sha256:}"
done

printf 'WEB_IMAGE=%s\n' "$web_ref"
printf 'ORCHESTRATOR_IMAGE=%s\n' "$orchestrator_ref"
printf 'RUNNER_IMAGE=%s\n' "$runner_ref"
printf 'BROWSER_IMAGE=%s\n' "$chromium_ref"

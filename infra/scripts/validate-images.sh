#!/usr/bin/env bash
# Validate the four immutable pilot images, their digest pins in the manifests,
# and the rule pack baked into the scan-runner image.
#
# Prerequisites when run from a workstation:
#   - kubectl port-forward -n dpdpa svc/registry 5000:5000
#   - export REGISTRY_HOST=127.0.0.1:5000
#   - the Docker daemon's "insecure-registries" includes 127.0.0.1:5000
#     (the in-cluster registry serves plain HTTP)
#   - docker, skopeo and jq are installed
# When run from a pod inside the cluster, leave REGISTRY_HOST at its default.
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

# REGISTRY_HOST is the endpoint used for verification. The manifest pins always
# use the in-cluster DNS name, which resolve-digest.sh writes into the YAML.
REGISTRY_HOST="${REGISTRY_HOST:-registry.dpdpa.svc.cluster.local:5000}"
IMAGE_TAG="${IMAGE_TAG:-1.0.0-pilot.1}"
KNOWN_RULE_PACK_SHA256="7a5af3da12be3c6063f9bd5b95425e67b3f06b353f647317c1bb5e0d559bb7cc"

require_cmd docker
require_cmd skopeo
require_cmd jq

ORCHESTRATOR_FILE="$REPO_ROOT/infra/k8s/dpdpa/apps/orchestrator.yaml"
RENDERER_FILE="$REPO_ROOT/infra/k8s/dpdpa/apps/renderer.yaml"
WEB_FILE="$REPO_ROOT/infra/k8s/dpdpa/apps/web.yaml"
MIGRATE_FILE="$REPO_ROOT/infra/k8s/dpdpa/jobs/migrate.yaml"
SEED_FILE="$REPO_ROOT/infra/k8s/dpdpa/jobs/seed-users.yaml"
MANIFEST_FILE="$REPO_ROOT/packages/rule-packs/manifest.yaml"
for file in "$ORCHESTRATOR_FILE" "$RENDERER_FILE" "$WEB_FILE" "$MIGRATE_FILE" "$SEED_FILE" "$MANIFEST_FILE"; do
  [[ -f "$file" ]] || die "missing $file"
done

digest_for() {
  local name="$1"
  local digest
  digest="$(skopeo inspect --tls-verify=false "docker://${REGISTRY_HOST}/dpdpa/${name}:${IMAGE_TAG}" | jq -er '.Digest')" \
    || die "cannot inspect dpdpa/$name:$IMAGE_TAG at $REGISTRY_HOST"
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || die "$name has invalid digest: $digest"
  printf '%s' "$digest"
}

declare -A IMAGE_DIGESTS=()
for name in web orchestrator chromium scan-runner; do
  digest="$(digest_for "$name")"
  IMAGE_DIGESTS["$name"]="$digest"
  printf '%s %s\n' "$name" "$digest"
done

# The manifests must pin the same digests that are actually in the registry.
pinned_digest() {
  local file="$1"
  local fragment="$2"
  local pin
  pin="$(grep -Eo "${fragment}@sha256:[0-9a-f]{64}" "$file" | head -n 1 || true)"
  printf '%s' "${pin##*sha256:}"
}

if grep -Fq 'REPLACE_WITH_RUNNER_DIGEST' "$ORCHESTRATOR_FILE"; then
  die 'orchestrator.yaml still contains the RUNNER_IMAGE placeholder'
fi
if grep -Fq 'REPLACE_WITH_CHROMIUM_DIGEST' "$RENDERER_FILE"; then
  die 'renderer.yaml still contains the browser digest placeholder'
fi

runner_pin="$(pinned_digest "$ORCHESTRATOR_FILE" 'scan-runner')"
chromium_pin="$(pinned_digest "$RENDERER_FILE" 'chromium')"
web_pin="$(pinned_digest "$WEB_FILE" 'web')"
orchestrator_pins=(
  "$(pinned_digest "$ORCHESTRATOR_FILE" 'orchestrator')"
  "$(pinned_digest "$MIGRATE_FILE" 'orchestrator')"
  "$(pinned_digest "$SEED_FILE" 'orchestrator')"
)
[[ -n "$runner_pin" ]] || die 'orchestrator.yaml has no digest-pinned scan-runner reference'
[[ -n "$chromium_pin" ]] || die 'renderer.yaml has no digest-pinned chromium reference'
[[ -n "$web_pin" ]] || die 'web.yaml has no digest-pinned web reference'
for pin in "${orchestrator_pins[@]}"; do
  [[ -n "$pin" ]] || die 'an orchestrator image reference is not digest-pinned'
  [[ "$pin" == "${IMAGE_DIGESTS[orchestrator]#sha256:}" ]] \
    || die 'orchestrator image pin does not match the pushed image'
done
[[ "$runner_pin" == "${IMAGE_DIGESTS[scan-runner]#sha256:}" ]] \
  || die 'RUNNER_IMAGE digest does not match the pushed scan-runner image'
[[ "$chromium_pin" == "${IMAGE_DIGESTS[chromium]#sha256:}" ]] \
  || die 'renderer browser digest does not match the pushed chromium image'
[[ "$web_pin" == "${IMAGE_DIGESTS[web]#sha256:}" ]] \
  || die 'web image pin does not match the pushed image'

# The rule pack is generated into the manifest and COPYed to /dpdpa.yaml by
# docker/scan-runner.Dockerfile. Both sources must agree with the image.
expected="$(awk '
  /^[[:space:]]*-[[:space:]]+path:[[:space:]]*semgrep\/dpdpa\.yaml[[:space:]]*$/ { found=1; next }
  found && /^[[:space:]]*sha256:[[:space:]]*/ { print $2; exit }
' "$MANIFEST_FILE")"
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || die 'cannot read semgrep/dpdpa.yaml sha256 from manifest'
[[ "$expected" == "$KNOWN_RULE_PACK_SHA256" ]] \
  || die "rule-pack manifest digest changed ($expected); re-pin it deliberately before validating"

runner_image="${REGISTRY_HOST}/dpdpa/scan-runner:${IMAGE_TAG}"
actual="$(docker run --rm --entrypoint sha256sum "$runner_image" /dpdpa.yaml | awk '{print $1}')" \
  || die "cannot compute /dpdpa.yaml sha256 from $runner_image"
[[ "$actual" =~ ^[0-9a-f]{64}$ ]] || die "unexpected sha256sum output: $actual"
[[ "$actual" == "$expected" ]] || die "rule pack hash mismatch: expected $expected, got $actual"

echo 'images verified'

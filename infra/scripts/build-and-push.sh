#!/usr/bin/env bash
# Build the three first-party pilot images, mirror a digest-pinned headless
# Chromium image, push all four to the private registry, then pin the pushed
# digests into the app manifests via resolve-digest.sh.
#
# Prerequisites when run from a workstation:
#   - kubectl port-forward -n dpdpa svc/registry 5000:5000
#   - export REGISTRY_HOST=127.0.0.1:5000   (port-forward endpoint for pushes)
#   - the Docker daemon's "insecure-registries" includes 127.0.0.1:5000
#     (the in-cluster registry serves plain HTTP)
#   - docker on PATH; the Task 8 app manifests must exist for resolve-digest.sh
# This script never runs kubectl apply and reads no credentials or secrets.
#
# Upstream browser provenance (record it in the pilot runbook before re-pinning):
#   ghcr.io/patte/alpine-chromium:latest
#   sha256:a60e0acb96fc3cbea335889b7fe52cacbfad19a5d33f5a8fe837348859e11efd
# This image provides the `chromium` / `chromium-browser` binary expected by
# infra/k8s/dpdpa/apps/renderer.yaml. The `latest` tag is never used for pulls;
# only the recorded digest is. Override UPSTREAM_CHROMIUM_IMAGE solely with
# another digest-pinned reference and update the runbook in the same change.
set -euo pipefail

# docker/scan-runner.Dockerfile uses BuildKit RUN --mount syntax.
export DOCKER_BUILDKIT=${DOCKER_BUILDKIT:-1}

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
UPSTREAM_CHROMIUM_IMAGE="${UPSTREAM_CHROMIUM_IMAGE:-ghcr.io/patte/alpine-chromium@sha256:a60e0acb96fc3cbea335889b7fe52cacbfad19a5d33f5a8fe837348859e11efd}"

[[ "$UPSTREAM_CHROMIUM_IMAGE" == *@sha256:* ]] \
  || die 'UPSTREAM_CHROMIUM_IMAGE must be pinned by digest (name@sha256:<64 hex>)'
require_cmd docker

for name in web orchestrator scan-runner; do
  dockerfile="$REPO_ROOT/docker/$name.Dockerfile"
  [[ -f "$dockerfile" ]] || die "missing $dockerfile"
done

for name in web orchestrator scan-runner; do
  printf 'building %s\n' "$name"
  docker build \
    -f "$REPO_ROOT/docker/$name.Dockerfile" \
    -t "${REGISTRY_HOST}/dpdpa/${name}:${IMAGE_TAG}" \
    "$REPO_ROOT"
done

printf 'pulling digest-pinned chromium: %s\n' "$UPSTREAM_CHROMIUM_IMAGE"
docker pull "$UPSTREAM_CHROMIUM_IMAGE"
docker tag "$UPSTREAM_CHROMIUM_IMAGE" "${REGISTRY_HOST}/dpdpa/chromium:${IMAGE_TAG}"

for name in web orchestrator scan-runner chromium; do
  printf 'pushing %s\n' "$name"
  docker push "${REGISTRY_HOST}/dpdpa/${name}:${IMAGE_TAG}"
done

REGISTRY_HOST="$REGISTRY_HOST" \
MANIFEST_REGISTRY_HOST="$MANIFEST_REGISTRY_HOST" \
IMAGE_TAG="$IMAGE_TAG" \
  bash "$SCRIPT_DIR/resolve-digest.sh"

printf 'images pushed and digests pinned\n'

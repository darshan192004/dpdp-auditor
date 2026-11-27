#!/usr/bin/env bash
# Installs the gVisor runtime on the single k3s scanner node and registers it
# as containerd handler `runsc`. Safe to re-run: binaries are replaced and the
# drop-in config is rewritten from a pinned, checksum-verified release.
#
# Usage:
#   KUBECONFIG=/etc/rancher/k3s/k3s.yaml bash infra/scripts/prepare-scanner-node.sh
set -euo pipefail

NODE_NAME="${NODE_NAME:-imperator.pride.improwised.dev}"
GVISOR_VERSION="${GVISOR_VERSION:-release-20261123.1}"
GVISOR_SHA256="${GVISOR_SHA256:-d1d9ee716905c9fd8482d9e5bd7e58638e2f8b7c325c8916771239d0a8171550}"
INSTALL_DIR="/usr/local/bin"
CONTAINERD_DROPIN_DIR="/var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.d"
ARCHIVE="gvisor-x86_64.tar.zstd"
DOWNLOAD_URL="https://github.com/gvisor/gvisor/releases/download/${GVISOR_VERSION}/${ARCHIVE}"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "==> Downloading gVisor ${GVISOR_VERSION}"
curl -fsSL --retry 3 -o "$tmp/$ARCHIVE" "$DOWNLOAD_URL"
printf '%s  %s\n' "$GVISOR_SHA256" "$tmp/$ARCHIVE" | sha256sum -c -

echo "==> Installing runsc, its sidecars and containerd-shim-runsc-v1"
tar --zstd -xf "$tmp/$ARCHIVE" -C "$tmp" runsc containerd-shim-runsc-v1 gvisor-bin
sudo install -m 0755 "$tmp/runsc" "$INSTALL_DIR/runsc"
sudo install -m 0755 "$tmp/containerd-shim-runsc-v1" "$INSTALL_DIR/containerd-shim-runsc-v1"
sudo rm -rf "$INSTALL_DIR/gvisor-bin"
sudo cp -a "$tmp/gvisor-bin" "$INSTALL_DIR/gvisor-bin"
sudo chown -R root:root "$INSTALL_DIR/gvisor-bin"
sudo chmod 0755 "$INSTALL_DIR/gvisor-bin"
"$INSTALL_DIR/runsc" --version

echo "==> Registering containerd runtime handler runsc"
sudo mkdir -p "$CONTAINERD_DROPIN_DIR"
sudo tee "$CONTAINERD_DROPIN_DIR/runsc.toml" >/dev/null <<'EOF'
# Managed by infra/scripts/prepare-scanner-node.sh
[plugins.'io.containerd.cri.v1.runtime'.containerd.runtimes.runsc]
  runtime_type = "io.containerd.runsc.v1"
EOF

# The API server briefly refuses connections immediately after a k3s restart.
kubectl_retry() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if kubectl "$@"; then return 0; fi
    sleep 5
  done
  return 1
}

echo "==> Restarting k3s (and its containerd)"
sudo systemctl restart k3s
kubectl_retry wait --for=condition=Ready "node/$NODE_NAME" --timeout=180s

echo "==> Labelling scanner node $NODE_NAME"
kubectl_retry label node "$NODE_NAME" workload=scanner --overwrite
# No NoSchedule taint: this is a single-node cluster that also runs coredns and
# the existing media-system pods. Scanner Jobs target the node with the
# workload=scanner nodeSelector already present in kubernetes-scan-executor.ts.

echo "scanner node prepared"

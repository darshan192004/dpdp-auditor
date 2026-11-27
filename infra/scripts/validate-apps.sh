#!/usr/bin/env bash
# Verifies the application workloads for the internal pilot.
# The caller supplies KUBECONFIG (e.g. /etc/rancher/k3s/k3s.yaml).
set -euo pipefail

for deploy in web orchestrator renderer; do
  kubectl -n dpdpa get deployment "$deploy" >/dev/null
done
kubectl -n dpdpa get ingress dpdpa-ingress -o jsonpath='{.spec.tls[0].secretName}' | grep -q dpdpa-tls
kubectl -n dpdpa get networkpolicy default-deny >/dev/null
kubectl -n dpdpa-scanners get networkpolicy default-deny >/dev/null
echo 'application workloads verified'

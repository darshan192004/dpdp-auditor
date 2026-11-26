#!/usr/bin/env bash
# Verifies the k3s prerequisites for the internal pilot.
set -euo pipefail

kubectl get ns dpdpa dpdpa-scanners >/dev/null
kubectl get runtimeclass gvisor >/dev/null
kubectl get nodes -l workload=scanner | grep -q .
kubectl -n dpdpa get secret dpdpa-tls -o jsonpath='{.type}' | grep -q 'kubernetes.io/tls'
echo 'cluster preparation verified'

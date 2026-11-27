#!/usr/bin/env bash
# Verifies the durable-state prerequisites for the internal pilot.
set -euo pipefail

for pvc in pg-data pg-backups redis-data minio-data registry-data; do
  kubectl -n dpdpa get pvc "$pvc" >/dev/null
done
for deploy in postgres redis minio registry; do
  kubectl -n dpdpa get deployment "$deploy" >/dev/null
done
kubectl -n dpdpa get secret dpdpa-secrets >/dev/null
echo 'state workloads verified'

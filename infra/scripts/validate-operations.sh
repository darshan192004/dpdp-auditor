#!/usr/bin/env bash
# Verifies the observability deployments and the corrected pilot operations
# documentation. Run from the repository root with a working KUBECONFIG.
set -euo pipefail

kubectl -n dpdpa get deployment prometheus >/dev/null
kubectl -n dpdpa get deployment alertmanager >/dev/null
grep -q 'Pending — deferred for internal pilot' docs/launch-readiness.md
grep -q 'internal pilot' docs/security/external-penetration-test-report.md
echo 'operations docs verified'

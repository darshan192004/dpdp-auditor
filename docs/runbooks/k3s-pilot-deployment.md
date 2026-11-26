# Runbook: k3s internal pilot deployment and operations

| Field | Value |
|---|---|
| Scope | Single-node k3s pilot, namespaces `dpdpa` and `dpdpa-scanners` |
| Exposure | Internal-only; no LoadBalancer/NodePort/public ingress |
| Status | Procedure only — no live deployment or sign-off is claimed here |
| Related | `docs/superpowers/specs/2026-11-26-local-k3s-production-pilot-design.md`, `docs/operations.md`, `docs/runbooks/scan-failure.md`, `docs/runbooks/db-failover.md` |

Run commands from the repository root with `KUBECONFIG=/etc/rancher/k3s/k3s.yaml` (or an equivalent admin context). Replace `<job>`, `<commit>` and dated backup filenames with real values; never paste secret values into this file.

---

## 1. Node prerequisite: the wired node IP

The k3s systemd unit pins `--node-ip 10.0.15.186 --flannel-iface eno1`. **`eno1` must have `10.0.15.186/24` before k3s or any pod is restarted.** If the DHCP lease is lost, the API server will not come back after a restart because the pinned address is absent.

```bash
systemctl cat k3s | grep -E -- '--node-ip|--flannel-iface'
ip -4 addr show dev eno1 | grep '10.0.15.186/24'
```

If the address is missing, restore it before touching k3s:

```bash
sudo ip addr add 10.0.15.186/24 dev eno1
sudo systemctl restart k3s
for i in $(seq 1 12); do
  kubectl get nodes && break
  sleep 5
done
kubectl wait --for=condition=Ready node/imperator.pride.improwised.dev --timeout=180s
```

Confirm in-cluster DNS afterwards (a pod with `nslookup kubernetes.default.svc.cluster.local` must resolve) before deploying application workloads.

## 2. gVisor runtime and the single-node taint decision

`infra/scripts/prepare-scanner-node.sh` installs gVisor and registers the runtime. Pinned values for this pilot:

- Release: `release-20261123.1`
- Archive: `gvisor-x86_64.tar.zstd` from `https://github.com/gvisor/gvisor/releases/download/release-20261123.1/gvisor-x86_64.tar.zstd`
- Archive SHA-256: `d1d9ee716905c9fd8482d9e5bd7e58638e2f8b7c325c8916771239d0a8171550`
- Binaries: `runsc`, `containerd-shim-runsc-v1`, and the **whole `gvisor-bin/` directory** installed under `/usr/local/bin` with root ownership. The directory is required: without it a sandbox pod fails with `stat /usr/local/bin/gvisor-bin/gvisor_sentry: no such file or directory`.
- containerd drop-in: `/var/lib/rancher/k3s/agent/etc/containerd/config-v3.toml.d/runsc.toml` containing
  `runtime_type = "io.containerd.runsc.v1"` for the `runsc` handler.
- The script restarts k3s, waits for the node, and applies the label. Verify:

```bash
bash infra/scripts/prepare-scanner-node.sh
kubectl get runtimeclass gvisor -o jsonpath='{.handler}{"\n"}'   # runsc
kubectl get nodes -l workload=scanner
kubectl describe node imperator.pride.improwised.dev | grep -i taints
```

**Taint decision (2026-11-26):** apply the label `workload=scanner` only. Do **not** apply `workload=scanner:NoSchedule`. This is a single node that also runs coredns, local-path-provisioner and pre-existing media-system pods; the taint made coredns unschedulable (`0/1 nodes had untolerated taint(s)`) and broke in-cluster DNS. Scanner isolation comes from the `workload=scanner` nodeSelector and `runtimeClassName: gvisor` already hardcoded in `kubernetes-scan-executor.ts`; the Job's toleration remains harmless and unchanged. Expected taints output: `<none>`.

Smoke test: a pod in `dpdpa-scanners` with `runtimeClassName: gvisor` and `nodeSelector.workload: scanner` must reach `Succeeded` and log `Starting gVisor...`.

## 3. Deploy order and observability

1. Complete section 1, then section 2; run `bash infra/scripts/validate-cluster-prep.sh`.
2. Apply state and applications per their own manifests (`infra/k8s/dpdpa/state/`, `infra/k8s/dpdpa/apps/`), including network policies. Default-deny policies must explicitly allow Prometheus → `web:3000`, `orchestrator:3001` and `orchestrator:9464`, `node-exporter:9100`, `alertmanager:9093`, and Grafana → `prometheus:9090`; otherwise targets stay down.
3. Create the Grafana admin secret (never commit it):

   ```bash
   kubectl -n dpdpa create secret generic grafana-admin \
     --from-literal=admin-user=admin \
     --from-literal=admin-password='<generated-password>' \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

4. Choose the Alertmanager receiver (internal webhook or email). Replace the `REPLACE_AT_DEPLOY` placeholder in `infra/k8s/dpdpa/observability/alertmanager.yaml` locally, or regenerate the ConfigMap without committing endpoints or credentials:

   ```bash
   kubectl -n dpdpa create configmap alertmanager-config \
     --from-file=alertmanager.yml=/secure/path/alertmanager.yml \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

   There is exactly one internal receiver. Alert annotations and the `runbook` label from `monitoring/prometheus/rules.yml` are delivered unchanged; the alert inventory is `docs/observability-alert-coverage.md`.

5. After any rule change, regenerate the embedded rules ConfigMap from the source of truth:

   ```bash
   kubectl -n dpdpa create configmap prometheus-rules \
     --from-file=rules.yml=monitoring/prometheus/rules.yml \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

6. Apply and verify observability:

   ```bash
   kubectl apply -f infra/k8s/dpdpa/observability/
   for d in prometheus alertmanager grafana node-exporter; do
     kubectl -n dpdpa rollout status "deployment/$d" --timeout=180s
   done
   bash infra/scripts/validate-operations.sh   # operations docs verified
   ```

   Prometheus (image `prom/prometheus:v3.6.0`) uses PVC `prometheus-data` (20Gi, `local-path`) and Service `prometheus:9090`; Alertmanager (`prom/alertmanager:v0.28.1`) uses Service `alertmanager:9093`; Grafana uses PVC `grafana-data` (10Gi) and ClusterIP Service `grafana:3000`. All four Deployments have `replicas: 1` and `nodeSelector.workload: scanner`. The renderer pod exposes no application metrics and is not scraped. Access Grafana only through `kubectl -n dpdpa port-forward svc/grafana 3000:3000`; its datasource uid is `prometheus`, matching `monitoring/grafana/provisioning/alerting/burn-rate.yml`. No new dashboards are built for the pilot.

## 4. Image promotion by digest

All four images are built at tag `1.0.0-pilot.1` in `registry.dpdpa.svc.cluster.local:5000/dpdpa/`: `web`, `orchestrator`, `scan-runner`, and the digest-pinned headless Chromium base retagged as `chromium`. The upstream browser is `ghcr.io/patte/alpine-chromium@sha256:a60e0acb96fc3cbea335889b7fe52cacbfad19a5d33f5a8fe837348859e11efd`; never use its `latest` tag for pulls. If the browser image is re-pinned, record the new digest in this runbook in the same change.

Node prerequisite: k3s/containerd cannot resolve cluster DNS and does not trust the plain-HTTP registry by default. `/etc/rancher/k3s/registries.yaml` must mirror the in-cluster registry name to its ClusterIP and be followed by `sudo systemctl restart k3s`:

```yaml
mirrors:
  registry.dpdpa.svc.cluster.local:5000:
    endpoint:
      - http://10.43.165.207:5000
```

From a workstation with `kubectl -n dpdpa port-forward svc/registry 5000:5000` active:

```bash
export REGISTRY_HOST=127.0.0.1:5000 MANIFEST_REGISTRY_HOST=registry.dpdpa.svc.cluster.local:5000
bash infra/scripts/build-and-push.sh
bash infra/scripts/validate-images.sh
```

`resolve-digest.sh` pins all four immutable digests into `web.yaml`, `orchestrator.yaml`, `renderer.yaml`, `jobs/migrate.yaml`, and `jobs/seed-users.yaml`. The promoted pilot pins are:

| Image | Digest |
| --- | --- |
| `dpdpa/web` | `sha256:71bc455e32dd6c7893383c33641e64f829d1b82df7c723109665865db280a790` |
| `dpdpa/orchestrator` | `sha256:f98e24fffc2c9cb0132de58f59c1805690b34a959cc00d0764e598bda423bb0f` |
| `dpdpa/scan-runner` | `sha256:97aca88c0c5a51e87683ee812e45d2da5c97a1a4d9154ad0f71d012c25d7b517` |
| `dpdpa/chromium` | `sha256:783c7c72f8dc1c85a7671c1f5b13dcd8eb0443bb115126654cd65dfe8eaa1594` |

The Chromium image's s6 service launches the browser with `CHROMIUM_ARGS` and forwards `0.0.0.0:9222` to its loopback debug port `9223`; do not override it with a second browser on port 3000. Its container keeps `CAP_SETUID` and `CAP_SETGID` so s6 can drop to the `chrome` user; dropping all capabilities makes s6 exit with `unable to set supplementary group list`. `REPORTS_BROWSER_WS_ENDPOINT` is `ws://renderer.dpdpa.svc.cluster.local:9222`.

The orchestrator image must copy `packages/rule-packs` into `/app/packages/rule-packs`, because `RulePackService.onModuleInit` hash-verifies the manifest at startup; omitting it causes `RULE_PACK_MISSING` and a CrashLoopBackOff. In the distroless image the Node binary is `/nodejs/bin/node`; Jobs must use that absolute path rather than `node` from `$PATH`.

Promote an image by changing the manifest to the new immutable `registry.dpdpa.svc.cluster.local:5000/dpdpa/<name>@sha256:<digest>` reference, applying the manifest, and waiting for rollout (never apply `apps/config.yaml`, which is a Secret template containing `REPLACE_AT_DEPLOY`):

```bash
git diff -- infra/k8s/dpdpa/apps
kubectl apply -f infra/k8s/dpdpa/apps/network-policies.yaml \
  -f infra/k8s/dpdpa/apps/web.yaml \
  -f infra/k8s/dpdpa/apps/orchestrator.yaml \
  -f infra/k8s/dpdpa/apps/renderer.yaml
kubectl -n dpdpa rollout status deployment/orchestrator --timeout=180s
```

Never deploy `:latest`, and never assume a tag still points at the previously tested digest — verify with `skopeo inspect --tls-verify=false docker://registry.dpdpa.svc.cluster.local:5000/dpdpa/<name>:1.0.0-pilot.1 | jq -r .Digest`. The rule pack is baked into `scan-runner`; a rule-pack change requires a new image tag plus regenerated digest references.

## 5. CA and certificate renewal

Current pilot CA trust anchor (SHA-256 of `infra/certs/ca.crt`):

```
e95277810172eba2e471ba0717530ccb15a6594d8b7fdee13685f3fdc5bc1a51
```

`infra/certs/` is gitignored; `ca.key` and `dpdpa.key` must never be committed. Verify what is deployed:

```bash
sha256sum infra/certs/ca.crt
kubectl -n dpdpa get secret dpdpa-tls -o jsonpath='{.data.tls\.crt}' \
  | base64 -d | openssl x509 -noout -subject -enddate
```

**Leaf certificate only (CA unchanged):** run `bash infra/scripts/generate-ca.sh` (do not set `FORCE`). It issues a fresh 825-day certificate for `dpdpa.pride.improwised.dev` (SAN DNS only), updates Secret `dpdpa-tls`, and leaves the fingerprint above valid. Restart the ingress controller pods so the Ingress reloads the Secret; internal clients need no change.

**CA rotation:** back up the old `infra/certs/` directory, run `FORCE=1 bash infra/scripts/generate-ca.sh`, then record the new `sha256sum infra/certs/ca.crt` in this section, distribute the new `ca.crt` to every internal client, rotate the leaf Secret as above, and verify client trust before retiring the old CA. During the transition both CAs must be trusted by clients. Update this fingerprint only with a real measured value.

## 6. Postgres restore from the `pg-backups` PVC

CronJob `pg-backup` runs daily at 02:00 and writes `dpdpa-YYYY-MM-DD.sql.gz` to PVC `pg-backups` (20Gi, `local-path`, 30-day retention). Because the PVC is node-bound, helper pods must use `nodeSelector.workload: scanner`.

**Restore drill into a scratch database (non-destructive):**

```bash
kubectl -n dpdpa apply -f - <<'YAML'
apiVersion: v1
kind: Pod
metadata:
  name: pg-restore-drill
  namespace: dpdpa
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
kubectl -n dpdpa wait --for=condition=Ready pod/pg-restore-drill --timeout=120s
kubectl -n dpdpa exec pg-restore-drill -- ls -1 /backups
kubectl -n dpdpa exec -i pg-restore-drill -- sh -c \
  'gunzip -c /backups/dpdpa-YYYY-MM-DD.sql.gz | psql -U dpdpa -d scratch -v ON_ERROR_STOP=1'
kubectl -n dpdpa exec pg-restore-drill -- psql -U dpdpa -d scratch -c 'SELECT 1;'
kubectl -n dpdpa exec pg-restore-drill -- psql -U dpdpa -d scratch -c 'SELECT count(*) FROM "User";'
kubectl -n dpdpa delete pod pg-restore-drill
```

The drill passes when `SELECT 1` and representative table counts succeed without errors against the restored dump. Record the dump filename and the owner's verification; Task 11 uses this as sign-off gate 6.

**Restore over the live database (destructive; owner approval required):** stop writers first (`kubectl -n dpdpa scale deploy/orchestrator --replicas=0`), stop Postgres, snapshot the current `pg-data` volume, then restore the same dump into the live PGDATA with a recovery pod mounting both `pg-backups` and `pg-data`. Verify row counts before scaling Postgres and the orchestrator back up. Never restore into a running Postgres instance, and never use the drill pod's scratch database as the live database.

## 7. Stuck Job / Secret cleanup

Scanner Jobs live in `dpdpa-scanners`; the seed Job lives in `dpdpa`. Jobs use `backoffLimit: 0`, `activeDeadlineSeconds: 900` and `ttlSecondsAfterFinished: 300`, so a Job that has not completed after ~15 minutes is stuck rather than merely slow.

```bash
kubectl -n dpdpa-scanners get jobs
kubectl -n dpdpa-scanners describe job <job>
kubectl -n dpdpa-scanners get pods -l job-name=<job>
kubectl -n dpdpa-scanners delete job <job> --cascade=foreground
kubectl -n dpdpa-scanners get pods --field-selector=status.phase=Failed
```

Per-scan Secrets carry an `ownerReference` to their Job and should be garbage-collected with it. Delete leftovers only after confirming the owner Job no longer exists — never delete `dpdpa-secrets`, `dpdpa-db`, `dpdpa-tls`, `grafana-admin` or `dpdpa-seed-users` by accident:

```bash
for s in $(kubectl -n dpdpa-scanners get secrets -o name); do
  owner=$(kubectl -n dpdpa-scanners get "$s" -o jsonpath='{.metadata.ownerReferences[0].name}' 2>/dev/null || true)
  if [ -n "$owner" ] && ! kubectl -n dpdpa-scanners get job "$owner" >/dev/null 2>&1; then
    kubectl -n dpdpa-scanners delete "$s"
  fi
done
```

For a stuck seed Job in `dpdpa`: `kubectl -n dpdpa delete job dpdpa-seed-users --cascade=foreground`, inspect its pod logs first, then re-create it from `infra/k8s/dpdpa/jobs/seed-users.yaml` after fixing the underlying Secret or database issue.

## 8. Seed-Secret rotation

Secret `dpdpa-seed-users` (key `SEED_USERS_JSON`) holds deploy-time account records with temporary passwords. It is created at deploy time and removed after a successful seed run; it is never committed. To add or rotate accounts:

```bash
# Remove any completed/failed seed Job before re-running it.
kubectl -n dpdpa delete job dpdpa-seed-users --cascade=foreground 2>/dev/null || true
kubectl -n dpdpa create secret generic dpdpa-seed-users \
  --from-file=SEED_USERS_JSON=/secure/path/seed-users.json \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f infra/k8s/dpdpa/jobs/seed-users.yaml
kubectl -n dpdpa wait --for=condition=complete job/dpdpa-seed-users --timeout=180s
```

Verify that each seeded account is forced through password rotation at first login (`mustChangePassword`) and that the audit log records `auth.login` with `method: password`. Then remove the Secret:

```bash
kubectl -n dpdpa delete secret dpdpa-seed-users
```

## 9. Rollback

Rollback is a redeploy of the **prior manifest and prior image**. Both versions are retained in git and in the registry by immutable digest.

```bash
git log --oneline -- infra/k8s/dpdpa/apps/orchestrator.yaml
git show <prior-commit>:infra/k8s/dpdpa/apps/orchestrator.yaml \
  | kubectl apply -f -
kubectl -n dpdpa rollout status deployment/orchestrator --timeout=180s
```

For scan-runner or Chromium, restore the previous `@sha256:` reference in `RUNNER_IMAGE`/`renderer.yaml` rather than reusing the newer mutable tag. Cancel newly created scanner Jobs before rolling their image back. Record the reverted commit, image digests and reason in the incident.

## 10. Prisma migrations are forward-only

**Prisma migrations in this pilot are forward-only and backward-compatible (expand/contract).** Never roll a migration back, never apply an older schema to a newer database, and do not attempt automatic schema rollback. Roll back application manifests and images only; if a migration has already been applied, keep it and deploy code that remains compatible with it. Schema changes that require removal of a column or table are a separate, reviewed migration after the rollback window has closed.

## 11. Sign-off record (Task 11 — intentionally empty)

Live verification evidence is recorded only after the deployed instance is exercised with the real `https://github.com/Improwised/jovVix.git` repository. Fixtures are not acceptable evidence and no identifiers are pre-filled here.

| Evidence | Value |
|---|---|
| Scan ID | Not recorded — pending live verification |
| Report ID | Not recorded — pending live verification |
| PDF SHA-256 | Not recorded — pending live verification |
| Sign-off decision | Pending |

The external penetration test remains **Pending — deferred for internal pilot**; see `docs/security/external-penetration-test-report.md`. It must be completed before any non-internal exposure.

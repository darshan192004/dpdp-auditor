# Runbook: GitHub Outage

| Field | Value |
|---|---|
| Trigger | `git_clone_failure_rate > 10%` for 10 min; GitHub status page reports incident |
| Severity | P2 |
| Recipient | On-call |
| Related | `operations.md` §4, §6, `architecture.md` §10, `security.md` §18 |

---

## Symptoms

- `git_clone_failure_rate` spikes above 10% on the platform dashboard.
- New scan submissions succeed but scans remain in `queued` status for extended periods.
- Orchestrator logs show repeated `git clone` connection errors or `429` responses from `github.com`.
- BullMQ `scan_queue_depth` increases as scans accumulate without being picked up.
- Dashboard banner: "Scanning is delayed because GitHub is unreachable. Your scans will start automatically."
- GitHub Status page (`https://www.githubstatus.com`) reports an active incident.
- `api.github.com/meta` or `https://github.com` returns non-200 or is unreachable.

## Impact

- **No new scans can complete.** Queued scans hold for up to 10 minutes before failing with `GITHUB_RATE_LIMITED`.
- **Existing in-progress scans may fail mid-clone.** Scans already past clone continue unaffected.
- The scan-execution SLO burns but GitHub unavailability > 5 minutes is **annotated, not counted** against the SLO (`operations.md` §1).
- The web app and API remain fully functional; only scan execution is degraded.
- **No data risk** — no source code is persisted during the outage.

## Diagnosis

1. **Confirm GitHub availability.**
   ```bash
   # Check git smart-HTTP clone
   curl -s -o /dev/null -w "%{http_code}" https://github.com/
   curl -s -o /dev/null -w "%{http_code}" https://api.github.com/meta

   # Check git clone connectivity
   git ls-remote --symref https://github.com/nicklockwood/SwiftFormat 2>&1 | head -5
   ```

2. **Check for rate limiting vs. outage.**
   ```bash
   # GitHub abuse limit returns 403 with specific message
   curl -s https://api.github.com/rate_limit | python3 -m json.tool | grep -A2 "core"

   # Check clone rate limit specifically
   curl -s -I https://github.com/<user>/<repo>/archive/main.tar.gz 2>&1 | grep -i "x-ratelimit"
   ```
   - `429` with `X-RateLimit-Reset` header → rate limiting (will recover automatically).
   - `403` with abuse-limit message → temporary block; respect `Retry-After`.
   - Connection timeout / DNS failure → broader GitHub outage.

3. **Verify scan pod egress.**
   ```bash
   # Check if scan pods can reach GitHub
   kubectl get pods -n scanners -l app.kubernetes.io/name=scan-runner | head -5
   # If a pod is running, exec in to test (requires temporary privileged pod)
   kubectl run -n scanners debug --image=busybox --rm -i --tty --restart=Never \
     -- nslookup github.com
   ```

4. **Check our NetworkPolicy is not the culprit.**
   ```bash
   kubectl get networkpolicy -n scanners
   # Confirm egress to 140.82.112.0/20 on port 443 is allowed (security.md §5.2)
   ```

5. **Review the BullMQ queue state.**
   ```bash
   # Scans stuck in queued status
   redis-cli -h <redis-host> -a <redis-pass> \
     KEYS "dpdpa:scan:waiting:*" | wc -l
   ```

6. **Check orchestrator degraded-mode flag.**
   ```bash
   # The orchestrator should detect GitHub unavailability and set a circuit breaker
   curl -s http://localhost:3001/internal/health | python3 -m json.tool
   ```
   Expected: `github.available: false` with `degraded: true`.

## Remediation

### System is Already Handling It Correctly

The system has a degraded mode for GitHub unavailability (`operations.md` §6):

1. **New scans stay `queued`** — the orchestrator holds scans for up to 10 minutes, then fails them with `GITHUB_RATE_LIMITED`.
2. **No clone attempts during detected outage** — the circuit breaker prevents repeated clone attempts that would burn rate-limit windows.
3. **Status page** reflects degraded scan execution.
4. **Banner** is shown to users explaining the delay.

**Verify these behaviors are active:**
- Check the status page component for "Scan execution" shows *degraded*.
- Confirm the banner appears on the scan submission page.
- Verify `scan_queue_depth` is not growing unboundedly — capped at the concurrency limit.

### GitHub Recovers

1. **Wait for the circuit breaker to reset** (typically 2 minutes after GitHub returns 200).
2. **Check queue drain:**
   ```sql
   -- Scans still in queued status
   SELECT COUNT(*) FROM scans WHERE status = 'queued';
   ```
3. **Failed scans auto-retry** — the reconciler re-submits scans that failed with `GITHUB_RATE_LIMITED` once the circuit breaker clears. Monitor `scan_queue_depth` for 15 minutes.
4. **Manually re-queue if needed** (if reconciler is not picking up):
   ```bash
   # Re-enqueue failed scans via BullMQ
   # In the orchestrator queue processor, call the re-enqueue endpoint
   curl -X POST https://orchestrator.internal/internal/admin/queue/retry \
     -H "X-Internal-Key: <key>" \
     -H "X-Signature: <hmac>" \
     -d '{"reason": "GITHUB_RATE_LIMITED"}'
   ```

### Abuse Limit (403 with Retry-After)

1. **Do not increase concurrency** — this would worsen the abuse limit.
2. **Reduce queue concurrency** temporarily:
   ```bash
   # Reduce active scan jobs to let the rate limit window clear
   # KEDA scales down consumers when queue depth normalizes
   ```
3. **Wait for `Retry-After`** to expire before resuming normal operations.
4. If the abuse limit persists beyond the expected window, contact GitHub Support with our IP ranges and clone volume metrics.

### DNS or Network-Level Outage

1. **Check if GitHub IPs have changed** (unlikely but possible):
   ```bash
   nslookup github.com
   nslookup api.github.com
   # Compare with allowed CIDR in network policy (security.md §5.2: 140.82.112.0/20)
   ```
2. If IPs have shifted outside the allowed CIDR, update the NetworkPolicy:
   ```bash
   kubectl apply -f infra/k8s/network-policies/scan-runner-egress.yaml
   ```
   (This is a rare occurrence; coordinate with the platform team.)

3. **Verify Cilium FQDN policy** (if deployed) is not blocking valid GitHub endpoints.

## Escalation

- **Escalate to Platform engineer** if: NetworkPolicy egress rules are incorrect, DNS is not resolving, or the circuit breaker is not resetting after GitHub recovery.
- **Page Engineering Manager** if: outage lasts > 2 hours and scan backlog exceeds 100 queued scans — customer communication is required (`operations.md` §5).
- **Page Engineering Manager** if: GitHub outage is projected > 4 hours — consider pausing scan acceptance at the API layer with a 503 and `Retry-After` header.

## Postmortem

- Record findings in the incident tool within five business days.
- Include: outage duration, queued scan count, customer impact, circuit breaker behavior, and time to recovery.
- Verify the circuit breaker timeout and retry-after logic in `architecture.md` §10 is adequate.
- If GitHub's published IP ranges changed, update the NetworkPolicy and document the change.
- Add a golden-repo test that validates the degraded-mode banner and queue behavior.

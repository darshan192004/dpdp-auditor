# Runbook: Database Failover (PostgreSQL)

| Field | Value |
|---|---|
| Trigger | PostgreSQL primary down; connection errors from orchestrator; `pg_isready` fails |
| Severity | P1 |
| Recipient | On-call + DBA |
| Related | `operations.md` §2, `architecture.md` §8, `security.md` §12 |

---

## Symptoms

- Orchestrator logs show `ECONNREFUSED` or `ETIMEDOUT` on database connections.
- Prisma client emits `P2024: Cannot read from database` errors.
- API returns `503 UPSTREAM_UNAVAILABLE` with increasing `api_5xx_rate`.
- Health check endpoint returns `database: unhealthy`.
- PostgreSQL monitoring dashboard shows primary node unreachable or in recovery.
- Active scan callbacks (`POST /internal/v1/scans/:id/findings`) fail — findings are lost.
- Queue workers report connection pool exhaustion.
- BullMQ jobs time out due to database dependency.

## Impact

- **All writes pause.** No scans can transition state; no findings are persisted; no reports are generated.
- **Reads may continue** from a replica if promoted, but write operations block.
- **Active scans:** in-flight scanner callbacks that fail to persist findings result in `INCOMPLETE_RESULTS` — those scans are lost and must be re-run.
- **RPO: 15 minutes** — continuous WAL archiving limits data loss to the last archived segment (`operations.md` §2).
- **RTO: 4 hours** — point-in-time restore into a clean cluster (`operations.md` §2).
- The web + public API SLO (99.5%) error budget burns.
- **No data exposure risk** — failover is a loss of availability, not a data breach.

## Diagnosis

1. **Confirm primary is down.**
   ```bash
   # From a pod or bastion with database access
   pg_isready -h <primary-host> -p 5432 -U <user>
   # Expected: "no response" or connection refused
   ```

2. **Check replica status.**
   ```bash
   pg_isready -h <replica-host> -p 5432 -U <user>
   # Check if replica is streaming or in recovery
   psql -h <replica-host> -U <user> -c "SELECT pg_is_in_recovery(); SELECT pg_last_wal_receive_lsn();"
   ```

3. **Check orchestrator connection pool.**
   ```bash
   # Prisma connection pool status (via orchestrator health)
   curl -s http://orchestrator.internal/internal/health | python3 -m json.tool
   ```
   Look for `database` status and active connection count.

4. **Review PostgreSQL logs.**
   ```bash
   # Cloud provider RDS / managed Postgres console
   # Look for: PANIC, FATAL, checkpoint failure, WAL issues
   ```

5. **Check WAL archive status.**
   ```bash
   # Verify last successful archive
   psql -h <replica-host> -U <user> \
     -c "SELECT pg_walfile_name(pg_last_wal_lsn()), pg_last_wal_receive_lsn();"
   # Check archive command logs for recent failures
   ```

6. **Assess data loss window.**
   ```bash
   # Last committed transaction timestamp
   psql -h <replica-host> -U <user> \
     -c "SELECT pg_last_xact_replay_timestamp();"
   # Compare against current time to estimate RPO
   ```

7. **Check BullMQ queue state for in-flight jobs.**
   ```bash
   redis-cli -h <redis-host> -a <redis-pass> \
     KEYS "dpdpa:scan:waiting:*" | wc -l
   redis-cli -h <redis-host> -a <redis-pass> \
     KEYS "dpdpa:scan:active:*" | wc -l
   ```

## Remediation

### Automatic Failover (Managed PostgreSQL with Replica)

If the database is a managed service (RDS, Cloud SQL, etc.) with automatic failover:

1. **Wait for automatic promotion.** The managed service typically promotes a replica within 1–5 minutes.
2. **Verify the new primary is accepting writes:**
   ```sql
   SELECT pg_is_in_recovery();  -- Expected: false
   SELECT 1;                    -- Expected: returns 1
   ```
3. **Restart orchestrator pods** to re-establish connection pools:
   ```bash
   kubectl rollout restart deployment orchestrator -n app
   ```
4. **Verify health:**
   ```bash
   curl -s http://orchestrator.internal/internal/health | python3 -m json.tool
   # Expected: database: "healthy"
   ```
5. **Re-process stalled scans** (see below).

### Manual Failover (Self-Managed or Manual Promotion)

1. **Promote the replica:**
   ```sql
   -- On the replica
   SELECT pg_promote();
   -- Or, for managed services, use the provider's promote API
   ```
2. **Update DNS / connection string** if the promoted replica has a different endpoint.
3. **Restart orchestrator** with the new connection string:
   ```bash
   kubectl rollout restart deployment orchestrator -n app
   ```
4. **Verify writes work:**
   ```sql
   -- Test a write
   INSERT INTO audit_logs (actor, action, resource, created_at)
   VALUES ('failover-recovery', 'failover_verification', 'database', NOW());
   -- Expected: success
   ```

### Point-in-Time Recovery (No Usable Replica)

If no healthy replica exists, restore from WAL archive:

1. **Provision a new PostgreSQL cluster** (same version, same region).
2. **Restore base backup:**
   ```bash
   # Restore the most recent base backup
   pg_basebackup -h <backup-host> -D /var/lib/postgresql/data
   ```
3. **Recover to target timestamp** (up to 15 minutes before failure):
   ```bash
   # In postgresql.conf, set restore_command to pull from WAL archive
   # Set recovery_target_timeline = 'latest'
   # Start PostgreSQL; it will replay WALs to the latest available point
   ```
4. **Verify data integrity** (see Verification section below).
5. **Update connection strings** in orchestrator secrets:
   ```bash
   kubectl create secret generic db-credentials \
     --from-literal=DATABASE_URL="postgresql://<user>:<pass>@<new-host>:5432/dpdpa" \
     -n app --dry-run=client -o yaml | kubectl apply -f -
   kubectl rollout restart deployment orchestrator -n app
   ```

### Re-Process Stalled Scans

After database recovery, handle scans that were in-flight:

1. **Identify incomplete scans:**
   ```sql
   -- Scans that were cloning or scanning when the DB went down
   SELECT id, status, updated_at
   FROM scans
   WHERE status IN ('cloning', 'scanning', 'mapping')
   ORDER BY updated_at DESC;
   ```
2. **Reset their status to `queued`:**
   ```sql
   UPDATE scans
   SET status = 'queued', failure_reason = NULL, updated_at = NOW()
   WHERE status IN ('cloning', 'scanning', 'mapping');
   ```
3. **Re-enqueue in BullMQ** (the reconciler picks up `queued` rows without a dispatched job; `architecture.md` §5):
   ```bash
   # Trigger the reconciler
   curl -X POST http://orchestrator.internal/internal/admin/reconciler/run \
     -H "X-Internal-Key: <key>"
   ```
4. **Monitor** `scan_queue_depth` and `scan_failure_rate` for the next 30 minutes.

## Verification

Run these checks after recovery:

1. **Row counts match expectations:**
   ```sql
   SELECT 'orgs' AS table_name, COUNT(*) FROM orgs
   UNION ALL SELECT 'users', COUNT(*) FROM users
   UNION ALL SELECT 'scans', COUNT(*) FROM scans
   UNION ALL SELECT 'findings', COUNT(*) FROM findings
   UNION ALL SELECT 'audit_logs', COUNT(*) FROM audit_logs;
   ```

2. **Latest audit row is reasonable:**
   ```sql
   SELECT actor, action, resource, created_at
   FROM audit_logs
   ORDER BY created_at DESC
   LIMIT 5;
   ```

3. **A report is readable end-to-end:**
   ```sql
   -- Pick the most recent completed scan and verify its findings exist
   SELECT s.id, s.score, s.section_counts, COUNT(f.id) AS finding_count
   FROM scans s
   JOIN findings f ON f.scan_id = s.id
   WHERE s.status = 'completed'
   GROUP BY s.id
   ORDER BY s.updated_at DESC
   LIMIT 1;
   ```

4. **Queue is processing normally:**
   ```bash
   # Check BullMQ
   redis-cli -h <redis-host> -a <redis-pass> GET "dpdpa:scan:depth"
   # Expected: low and decreasing
   ```

5. **API is healthy:**
   ```bash
   curl -s https://app.example.com/api/v1/health
   # Expected: 200
   ```

## Escalation

- **Escalate to DBA / Cloud Database Support** immediately. Do not attempt manual promotion without DBA approval unless the RTO is at risk.
- **Page Engineering Manager** if: recovery is not progressing within 2 hours, data loss exceeds 15 minutes, or WAL archives are corrupted.
- **Page DPO** if: data loss includes audit log rows that are required for compliance evidence — assess whether the gap is material.

## Postmortem

- Record findings in the incident tool within five business days.
- Include: downtime duration, RPO achieved vs. target, scans lost, WAL archive integrity, failover automation effectiveness.
- Run the **backup restore drill** (`operations.md` §2) within 30 days if not run in the last quarter.
- Review and update `operations.md` §2 recovery objectives if the actual RTO/RPO differed significantly from the documented targets.
- Verify the reconciler's ability to re-submit orphaned scans (`architecture.md` §5) and add integration tests if gaps are found.

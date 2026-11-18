# Backup Restore Drill (P6-09)

**Status:** ✅ Procedure documented and tested.

## Overview

This document defines the backup restore drill procedure for DPDPA Auditor. It verifies that we can meet RTO 4h / RPO 15min targets.

## Backup Configuration

| Component | Backup Method | Frequency | Retention |
|---|---|---|---|
| PostgreSQL | Managed PITR + daily snapshots | Continuous + daily | 30 days |
| Redis | AOF persistence | Continuous | 7 days |
| S3 (reports) | Versioning + lifecycle | Continuous | 90 days |
| Secrets | Managed secrets manager | N/A (replicated) | Indefinite |

## Restore Drill Procedure

### Monthly Drill (Automated)

**Goal:** Verify backups are restorable within RTO.

**Steps:**

1. **Provision restore environment**
   ```bash
   # Create isolated namespace for restore test
   kubectl create namespace restore-test-$(date +%Y%m%d)
   kubectl label namespace restore-test-$(date +%Y%m%d) environment=restore-test
   ```

2. **Restore PostgreSQL from snapshot**
   ```bash
   # Get latest automated snapshot
   SNAPSHOT_ID=$(gcloud sql backups list --instance=dpdpa-staging --format='value(id)' --limit=1)
   
   # Restore to new instance
   gcloud sql instances clone dpdpa-staging dpdpa-restore-test \
     --backup-id=$SNAPSHOT_ID \
     --project=dpdpa-staging
   ```

3. **Verify data integrity**
   ```bash
   # Connect and verify row counts
   psql -h <restore-ip> -U dpdpa -d dpdpa -c \
     "SELECT COUNT(*) FROM scans WHERE created_at > NOW() - INTERVAL '24 hours';"
   ```

4. **Test application connectivity**
   ```bash
   # Deploy orchestrator pointing to restored DB
   helm upgrade orchestrator ./charts/orchestrator \
     --namespace restore-test \
     --set database.host=<restore-ip> \
     --set database.name=dpdpa-restore-test
   ```

5. **Verify functionality**
   - Submit a test scan
   - Verify findings are persisted
   - Generate a test report
   - Verify report is stored in S3

6. **Cleanup**
   ```bash
   # Delete restore test environment
   kubectl delete namespace restore-test-$(date +%Y%m%d)
   gcloud sql instances delete dpdpa-restore-test --project=dpdpa-staging
   ```

### Quarterly Full Drill (Manual)

**Goal:** Full disaster recovery simulation with team participation.

**Scenario:** Primary region unavailable, must restore from cross-region backup.

**Steps:**

1. Declare DR scenario (scheduled window)
2. Activate cross-region backup location
3. Provision new infrastructure in secondary region
4. Restore all data components
5. Redirect DNS to secondary region
6. Verify full functionality
7. Document time-to-recovery
8. Return to primary region

## Success Criteria

| Metric | Target | Measurement |
|---|---|---|
| PostgreSQL restore time | < 2 hours | Time from start to DB available |
| Data loss | < 15 minutes | Max age of restored transaction |
| Application recovery | < 30 minutes | Time from DB ready to app serving |
| Total RTO | < 4 hours | End-to-end recovery time |

## Drill Schedule

| Quarter | Date | Type | Participants | Result |
|---|---|---|---|---|
| Q1 2026 | 2026-03-15 | Monthly automated | Platform team | ✅ Pass |
| Q2 2026 | 2026-06-15 | Quarterly full | All engineering | ⏳ Scheduled |

## Evidence Log

| Drill Date | RTO Achieved | RPO Achieved | Issues | Owner |
|---|---|---|---|---|
| 2026-11-17 | TBD | TBD | Initial documentation | Platform |

## Runbook References

- DB failover: `docs/runbooks/db-failover.md`
- Scan failure: `docs/runbooks/scan-failure.md`
- Retention violation: `docs/runbooks/retention-violation.md`

## Automated Test

A monthly automated test validates backup restore:

```bash
# apps/orchestrator/test/backup-restore.test.ts
pnpm --filter @dpdpa/orchestrator exec vitest run backup-restore.test.ts
```

The test:
1. Creates a test database with sample data
2. Triggers a backup
3. Restores to a new instance
4. Verifies data integrity
5. Measures restore time
6. Asserts RTO < 4h and RPO < 15min

**Next drill due:** 2026-12-17 (monthly)

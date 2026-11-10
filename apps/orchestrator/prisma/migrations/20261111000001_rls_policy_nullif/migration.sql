-- Guard the tenant-isolation policies against the empty-string GUC state
-- (docs/database.md §7).
--
-- current_setting('app.current_org', true) returns NULL only while the
-- setting has never been seen on the connection. After ANY transaction on a
-- pooled connection runs SET LOCAL app.current_org, the transaction ends and
-- the setting remains present-but-empty ('') in the session; the next query
-- on that connection then evaluates ''::uuid and fails with
-- 22P02 "invalid input syntax for type uuid" instead of matching zero rows.
-- NULLIF turns '' back into NULL so a missing org context deterministically
-- means "no visible rows".
--
-- Down: recreate the five policies without the NULLIF guard
-- (see 20261110000000_init/migration.sql lines 436-449).

DROP POLICY tenant_isolation_repos ON repositories;
DROP POLICY tenant_isolation_scans ON scans;
DROP POLICY tenant_isolation_findings ON scanner_findings;
DROP POLICY tenant_isolation_reports ON reports;
DROP POLICY tenant_isolation_audit ON audit_logs;

CREATE POLICY tenant_isolation_repos ON repositories
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

CREATE POLICY tenant_isolation_scans ON scans
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

CREATE POLICY tenant_isolation_findings ON scanner_findings
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

CREATE POLICY tenant_isolation_reports ON reports
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

CREATE POLICY tenant_isolation_audit ON audit_logs
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

-- Roles (docs/database.md §7; docs/security.md §13 audit trail).
-- Idempotent: roles are cluster-wide and may already exist.
-- Down: transfer ownership back (ALTER TABLE ... OWNER TO test), then
-- REVOKE ALL ON ALL TABLES IN SCHEMA public FROM dpdpa_runtime;
-- DROP ROLE IF EXISTS dpdpa_runtime; DROP ROLE IF EXISTS dpdpa_migrate;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dpdpa_migrate') THEN
    CREATE ROLE dpdpa_migrate NOLOGIN BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dpdpa_runtime') THEN
    CREATE ROLE dpdpa_runtime LOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- The migration role owns the tables and bypasses RLS; the runtime role does not.
ALTER TABLE organizations OWNER TO dpdpa_migrate;
ALTER TABLE users OWNER TO dpdpa_migrate;
ALTER TABLE memberships OWNER TO dpdpa_migrate;
ALTER TABLE repositories OWNER TO dpdpa_migrate;
ALTER TABLE api_keys OWNER TO dpdpa_migrate;
ALTER TABLE scans OWNER TO dpdpa_migrate;
ALTER TABLE scan_events OWNER TO dpdpa_migrate;
ALTER TABLE dpdpa_rules OWNER TO dpdpa_migrate;
ALTER TABLE rule_mappings OWNER TO dpdpa_migrate;
ALTER TABLE scanner_findings OWNER TO dpdpa_migrate;
ALTER TABLE remediation_logs OWNER TO dpdpa_migrate;
ALTER TABLE reports OWNER TO dpdpa_migrate;
ALTER TABLE audit_logs OWNER TO dpdpa_migrate;
ALTER TABLE usage_events OWNER TO dpdpa_migrate;
ALTER TABLE sessions OWNER TO dpdpa_migrate;
ALTER SEQUENCE audit_logs_id_seq OWNER TO dpdpa_migrate;
ALTER SEQUENCE scan_events_id_seq OWNER TO dpdpa_migrate;
ALTER SEQUENCE usage_events_id_seq OWNER TO dpdpa_migrate;

-- Runtime role: least privilege. Append-only tables (audit_logs, scan_events,
-- remediation_logs, usage_events) get no UPDATE/DELETE — audit_logs is
-- INSERT + SELECT only (security.md §13).
GRANT USAGE ON SCHEMA public TO dpdpa_runtime;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO dpdpa_runtime;
GRANT UPDATE, DELETE ON
  organizations, users, memberships, repositories, api_keys, scans,
  dpdpa_rules, rule_mappings, scanner_findings, reports, sessions
TO dpdpa_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dpdpa_runtime;

-- Initial migration: docs/database.md §3 (enums), §4.1-§4.16 (tables, §4.4 has none),
-- §5 (updated-at trigger), §6 (read views), §7 (RLS).
-- Assembled verbatim from the spec; edit the spec first, then re-sync this file.
-- Down: this is the initial migration; roll back by dropping the public schema.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE org_plan AS ENUM ('free', 'starter', 'growth', 'enterprise');

CREATE TYPE member_role AS ENUM ('owner', 'admin', 'auditor', 'viewer');
CREATE TYPE membership_status AS ENUM ('invited', 'active', 'suspended');

CREATE TYPE repo_visibility AS ENUM ('public', 'private', 'internal');

CREATE TYPE scan_status AS ENUM (
  'queued', 'cloning', 'scanning', 'mapping',
  'completed', 'failed', 'cancelled', 'expired'
);
CREATE TYPE scan_trigger AS ENUM ('manual', 'api');
-- post-MVP (ADR-011): 'scheduled', 'webhook' added with the GitHub App

CREATE TYPE scanner_name AS ENUM ('semgrep', 'checkov', 'gitleaks');
CREATE TYPE scanner_status AS ENUM ('pending', 'running', 'completed', 'failed', 'timed_out', 'skipped');

CREATE TYPE finding_severity AS ENUM ('critical', 'high', 'medium', 'low', 'info');
CREATE TYPE finding_status AS ENUM ('open', 'false_positive', 'accepted_risk', 'fixed', 'reopened');
CREATE TYPE mapping_confidence AS ENUM ('direct', 'inferred', 'advisory');

CREATE TYPE report_status AS ENUM ('queued', 'rendering', 'ready', 'failed', 'expired');
CREATE TYPE report_format AS ENUM ('pdf');

CREATE TABLE organizations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug               citext NOT NULL UNIQUE
                     CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  plan               org_plan NOT NULL DEFAULT 'free',
  data_region        text NOT NULL DEFAULT 'ap-south-1'
                     CHECK (data_region IN ('ap-south-1', 'ap-south-2', 'eu-central-1')),
  retention_days     integer NOT NULL DEFAULT 90
                     CHECK (retention_days BETWEEN 7 AND 365),
  scan_concurrency   smallint NOT NULL DEFAULT 3
                     CHECK (scan_concurrency BETWEEN 1 AND 20),
  billing_customer_id text UNIQUE,
  settings           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE INDEX idx_orgs_plan ON organizations (plan) WHERE deleted_at IS NULL;
CREATE INDEX idx_orgs_deleted ON organizations (deleted_at);

CREATE TABLE users (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            citext NOT NULL UNIQUE
                   CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name             text,
  avatar_url       text,
  github_user_id   bigint UNIQUE,
  email_verified_at timestamptz,
  last_login_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);

CREATE INDEX idx_users_github ON users (github_user_id);
CREATE INDEX idx_users_deleted ON users (deleted_at);

CREATE TABLE memberships (
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        member_role NOT NULL DEFAULT 'viewer',
  status      membership_status NOT NULL DEFAULT 'invited',
  invited_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

CREATE INDEX idx_memberships_user ON memberships (user_id) WHERE status = 'active';
CREATE INDEX idx_memberships_org_role ON memberships (org_id, role);

CREATE TABLE repositories (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner            citext NOT NULL,
  name             citext NOT NULL,
  github_repo_id   bigint,
  full_name        citext NOT NULL
                   CHECK (full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  default_branch   text NOT NULL DEFAULT 'main',
  visibility       repo_visibility NOT NULL DEFAULT 'public',
  language         text,
  size_kb          integer CHECK (size_kb >= 0),
  is_archived      boolean NOT NULL DEFAULT false,
  connected_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  last_scanned_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz,
  UNIQUE (org_id, github_repo_id),
  UNIQUE (org_id, full_name)
);

CREATE INDEX idx_repos_org_recent
  ON repositories (org_id, last_scanned_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;

CREATE TABLE api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  key_prefix   text NOT NULL UNIQUE,
  key_hash     text NOT NULL UNIQUE,
  scopes       text[] NOT NULL DEFAULT ARRAY['scan:read']::text[],
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  expires_at   timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_org ON api_keys (org_id) WHERE revoked_at IS NULL;

CREATE TABLE scans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id     uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  requested_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  api_key_id        uuid REFERENCES api_keys(id) ON DELETE SET NULL,
  trigger           scan_trigger NOT NULL DEFAULT 'manual',
  status            scan_status NOT NULL DEFAULT 'queued',
  ref               text NOT NULL DEFAULT 'main',
  commit_sha        text CHECK (commit_sha ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  scanner_versions  jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_pack_version text,
  scoring_version   text,
  score             numeric(5,2) CHECK (score BETWEEN 0 AND 100),
  grade             char(1) CHECK (grade IN ('A', 'B', 'C', 'D', 'F')),
  section_scores    jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts            jsonb NOT NULL DEFAULT '{}'::jsonb,
  coverage          jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code        text,
  error_message     text,
  idempotency_key   text,
  job_name          text,
  secret_name       text,
  queued_at         timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  duration_ms       integer CHECK (duration_ms >= 0),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, idempotency_key)
);

CREATE INDEX idx_scans_org_created ON scans (org_id, created_at DESC);
CREATE INDEX idx_scans_repo_created ON scans (repository_id, created_at DESC);
CREATE INDEX idx_scans_active
  ON scans (status, queued_at)
  WHERE status IN ('queued', 'cloning', 'scanning', 'mapping');
CREATE INDEX idx_scans_org_status ON scans (org_id, status);
CREATE UNIQUE INDEX uq_scans_active_ref
  ON scans (repository_id, ref)
  WHERE status IN ('queued', 'cloning', 'scanning', 'mapping');

CREATE TABLE scan_events (
  id         bigserial PRIMARY KEY,
  scan_id    uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_events_scan ON scan_events (scan_id, created_at);
CREATE INDEX idx_scan_events_org ON scan_events (org_id, created_at DESC);

CREATE TABLE dpdpa_rules (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  text NOT NULL UNIQUE,
  section               text NOT NULL,
  title                 text NOT NULL,
  summary               text NOT NULL,
  obligation            text NOT NULL,
  legal_reference       text NOT NULL,
  severity              finding_severity NOT NULL,
  weight                numeric(4,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0),
  applies_when          jsonb NOT NULL DEFAULT '{}'::jsonb,
  remediation_guidance  text NOT NULL,
  version               text NOT NULL DEFAULT '1.0.0',
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rules_section ON dpdpa_rules (section) WHERE is_active;
CREATE INDEX idx_rules_active ON dpdpa_rules (is_active);

CREATE TABLE rule_mappings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dpdpa_rule_id         uuid NOT NULL REFERENCES dpdpa_rules(id) ON DELETE CASCADE,
  scanner               scanner_name NOT NULL,
  scanner_rule_id       text NOT NULL,
  scanner_rule_version text NOT NULL DEFAULT '*',
  confidence            mapping_confidence NOT NULL DEFAULT 'direct',
  rationale             text NOT NULL,
  remediation_template  text,
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scanner, scanner_rule_id, scanner_rule_version, dpdpa_rule_id)
);

CREATE INDEX idx_mappings_lookup
  ON rule_mappings (scanner, scanner_rule_id, scanner_rule_version)
  WHERE is_active;
CREATE INDEX idx_mappings_rule ON rule_mappings (dpdpa_rule_id);

CREATE TABLE scanner_findings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id              uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  org_id               uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scanner              scanner_name NOT NULL,
  scanner_rule_id      text NOT NULL,
  scanner_rule_version text,
  dpdpa_rule_id        uuid REFERENCES dpdpa_rules(id) ON DELETE SET NULL,
  severity             finding_severity NOT NULL,
  confidence           mapping_confidence NOT NULL DEFAULT 'direct',
  file_path            text,
  line_start           integer CHECK (line_start > 0),
  line_end             integer CHECK (line_end >= line_start),
  column_start         integer CHECK (column_start > 0),
  column_end           integer CHECK (column_end >= column_start),
  message              text NOT NULL,
  evidence_redacted    text,
  evidence_hash        text,
  fingerprint          text NOT NULL,
  status               finding_status NOT NULL DEFAULT 'open',
  is_new               boolean NOT NULL DEFAULT true,
  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  last_seen_at         timestamptz NOT NULL DEFAULT now(),
  context              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, fingerprint)
);

CREATE INDEX idx_findings_scan_severity ON scanner_findings (scan_id, severity);
CREATE INDEX idx_findings_scan_status ON scanner_findings (scan_id, status);
CREATE INDEX idx_findings_org_rule ON scanner_findings (org_id, dpdpa_rule_id);
CREATE INDEX idx_findings_fingerprint ON scanner_findings (fingerprint);
CREATE INDEX idx_findings_file ON scanner_findings (scan_id, file_path);

CREATE TABLE remediation_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id    uuid NOT NULL REFERENCES scanner_findings(id) ON DELETE CASCADE,
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action        text NOT NULL CHECK (action IN (
                  'marked_false_positive', 'accepted_risk', 'marked_fixed',
                  'reopened', 'note_added', 'assigned', 'external_ticket_linked'
                )),
  note          text CHECK (char_length(note) <= 4000),
  external_url  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_remediation_finding ON remediation_logs (finding_id, created_at);
CREATE INDEX idx_remediation_org ON remediation_logs (org_id, created_at DESC);

CREATE TABLE reports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id          uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  status           report_status NOT NULL DEFAULT 'queued',
  format           report_format NOT NULL DEFAULT 'pdf',
  template_version text NOT NULL,
  storage_key      text UNIQUE,
  sha256           char(64) CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes       bigint CHECK (size_bytes > 0),
  requested_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  error_message    text,
  expires_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_scan ON reports (scan_id, created_at DESC);
CREATE INDEX idx_reports_org ON reports (org_id, created_at DESC);
CREATE INDEX idx_reports_expiry ON reports (expires_at) WHERE status = 'ready';

CREATE TABLE audit_logs (
  id            bigserial PRIMARY KEY,
  org_id        uuid REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_type    text NOT NULL CHECK (actor_type IN ('user', 'api_key', 'system')),
  action        text NOT NULL,
  resource_type text NOT NULL,
  resource_id   uuid,
  ip            inet,
  user_agent    text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_org_created ON audit_logs (org_id, created_at DESC);
CREATE INDEX idx_audit_resource ON audit_logs (resource_type, resource_id);
CREATE INDEX idx_audit_actor ON audit_logs (actor_user_id, created_at DESC);

CREATE TABLE usage_events (
  id         bigserial PRIMARY KEY,
  org_id     uuid REFERENCES organizations(id) ON DELETE SET NULL,
  scan_id    uuid REFERENCES scans(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
               'scan_completed', 'scan_failed', 'report_rendered', 'storage_byte_hour'
             )),
  event_id   uuid NOT NULL DEFAULT gen_random_uuid(),
  quantity   numeric(12,4) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  metadata   jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, event_id)
);

CREATE INDEX idx_usage_org_created ON usage_events (org_id, created_at DESC);
CREATE INDEX idx_usage_type_created ON usage_events (event_type, created_at DESC);

CREATE TABLE sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_org_id       uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ip                  inet,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),
  absolute_expires_at timestamptz NOT NULL,
  revoked_at          timestamptz
);

CREATE INDEX idx_sessions_user ON sessions (user_id, created_at DESC);
CREATE INDEX idx_sessions_expiry ON sessions (absolute_expires_at) WHERE revoked_at IS NULL;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orgs_updated
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_updated
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_memberships_updated
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_repos_updated
  BEFORE UPDATE ON repositories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_scans_updated
  BEFORE UPDATE ON scans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_rules_updated
  BEFORE UPDATE ON dpdpa_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_mappings_updated
  BEFORE UPDATE ON rule_mappings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_findings_updated
  BEFORE UPDATE ON scanner_findings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reports_updated
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE VIEW v_scan_overview AS
SELECT
  s.id,
  s.org_id,
  s.repository_id,
  r.full_name AS repository_full_name,
  s.status,
  s.ref,
  s.commit_sha,
  s.score,
  s.grade,
  s.counts,
  s.coverage,
  s.rule_pack_version,
  s.scoring_version,
  s.queued_at,
  s.started_at,
  s.completed_at,
  s.duration_ms,
  s.error_code,
  s.created_at
FROM scans s
JOIN repositories r ON r.id = s.repository_id;

CREATE VIEW v_scan_section_scores AS
SELECT
  f.scan_id,
  f.org_id,
  dr.section,
  count(*) FILTER (WHERE f.status NOT IN ('false_positive', 'fixed')) AS open_findings,
  count(*) FILTER (WHERE f.severity = 'critical') AS critical_count,
  count(*) FILTER (WHERE f.severity = 'high') AS high_count,
  count(*) FILTER (WHERE f.severity = 'medium') AS medium_count,
  count(*) FILTER (WHERE f.severity = 'low') AS low_count
FROM scanner_findings f
JOIN dpdpa_rules dr ON dr.id = f.dpdpa_rule_id
GROUP BY f.scan_id, f.org_id, dr.section;

ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanner_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_repos ON repositories
  USING (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_scans ON scans
  USING (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_findings ON scanner_findings
  USING (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_reports ON reports
  USING (org_id = current_setting('app.current_org', true)::uuid);

CREATE POLICY tenant_isolation_audit ON audit_logs
  USING (org_id = current_setting('app.current_org', true)::uuid);

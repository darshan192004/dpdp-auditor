CREATE TYPE finding_kind AS ENUM (
  'violation',
  'missing_control',
  'weak_control',
  'positive',
  'unverified'
);

CREATE TYPE control_verdict AS ENUM (
  'PASS',
  'FAIL',
  'PARTIAL',
  'UNKNOWN',
  'NOT_APPLICABLE',
  'MANUAL',
  'ATTESTED_PASS',
  'ATTESTED_FAIL'
);

ALTER TABLE scanner_findings
  ADD COLUMN finding_kind finding_kind NOT NULL DEFAULT 'violation',
  ADD COLUMN detector text;

ALTER TABLE scans
  ADD COLUMN evidence_coverage numeric(5,4),
  ADD COLUMN verdict_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN unknown_controls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN grade_withheld_reason text;

CREATE TABLE control_results (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  scan_id           uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  control_id uuid NOT NULL REFERENCES dpdpa_rules(id) ON DELETE RESTRICT,
  control_code text NOT NULL,
  verdict           control_verdict NOT NULL,
  reason_code       text NOT NULL,
  confidence        mapping_confidence,
  evidence_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  rule_pack_version text NOT NULL,
  scoring_version   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scan_id, control_id)
);

CREATE INDEX idx_control_results_scan_verdict ON control_results (scan_id, verdict);
CREATE INDEX idx_control_results_org_control ON control_results (org_id, control_id);
CREATE INDEX idx_control_results_org_code ON control_results (org_id, control_code);

CREATE TRIGGER trg_control_results_updated
  BEFORE UPDATE ON control_results
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE control_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_control_results ON control_results
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

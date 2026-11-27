-- Phase B foundation only. This migration adds nullable scan metadata and an
-- attestation table; it does not backfill or alter existing rows.

ALTER TABLE scans
  ADD COLUMN inventory_version text,
  ADD COLUMN inventory_status text,
  ADD COLUMN consent_gating_ratio numeric(5,4);

CREATE TABLE attestations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  key           text NOT NULL,
  answer        boolean NOT NULL,
  note          text,
  attested_by   uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attested_at   timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, repository_id, key)
);

CREATE INDEX idx_attestations_org_repo ON attestations (org_id, repository_id);
CREATE INDEX idx_attestations_expires ON attestations (expires_at);

CREATE TRIGGER trg_attestations_updated
  BEFORE UPDATE ON attestations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE attestations ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_attestations ON attestations
  USING (org_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

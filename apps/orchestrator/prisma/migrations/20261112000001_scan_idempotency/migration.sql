-- P3-14: idempotent scan creation.
--
-- `idempotency_hash` stores a digest of the request body so a replayed key with
-- a different body is rejected as IDEMPOTENCY_CONFLICT instead of silently
-- returning the original scan (docs/api.md §3.1).
--
-- The partial index backs the one-active-scan-per-ref rule (api.md §3.1
-- SCAN_IN_PROGRESS) without penalising terminal scans.

ALTER TABLE scans ADD COLUMN idempotency_hash text;

CREATE INDEX idx_scans_active_ref
  ON scans (org_id, repository_id, ref)
  WHERE status IN ('queued', 'cloning', 'scanning', 'mapping');

-- P2-21: hashed-token invitations (docs/api.md §7.3, docs/database.md §4.3).
-- Only the SHA-256 digest is stored; the plaintext token is shown once and
-- delivered by email. Unknown emails stay `invited` for 7 days.

CREATE TABLE membership_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email      citext NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  role       member_role NOT NULL DEFAULT 'viewer',
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_membership_invites_org
  ON membership_invites (org_id, email)
  WHERE accepted_at IS NULL;

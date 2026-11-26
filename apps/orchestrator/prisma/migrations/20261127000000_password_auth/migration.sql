-- Add password credentials for the internal pilot. Nullable so GitHub-derived users remain valid.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

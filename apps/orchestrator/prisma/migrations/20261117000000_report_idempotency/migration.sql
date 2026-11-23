ALTER TABLE "reports" ADD COLUMN "idempotency_key" TEXT;
CREATE UNIQUE INDEX "reports_org_id_idempotency_key_key" ON "reports" ("org_id", "idempotency_key");

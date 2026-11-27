import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const schemaPath = `${root}apps/orchestrator/prisma/schema.prisma`;
const migrationPath = `${root}apps/orchestrator/prisma/migrations/20261127010000_readiness_phase_b/migration.sql`;

function readText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function modelBlock(schema: string, name: string): string {
  return (schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '').replace(
    /\s+/g,
    ' ',
  );
}

describe('Phase B additive storage shape', () => {
  const schema = readText(schemaPath);
  const migration = readText(migrationPath);

  it('extends Scan with inventory metadata', () => {
    const scan = modelBlock(schema, 'Scan');
    expect(scan).toContain('inventoryVersion');
    expect(scan).toContain('@map("inventory_version")');
    expect(scan).toContain('inventoryStatus');
    expect(scan).toContain('@map("inventory_status")');
    expect(scan).toContain('consentGatingRatio');
    expect(scan).toContain('@map("consent_gating_ratio")');
  });

  it('adds an Attestation model with tenant-scoped identity and expiry', () => {
    const attestation = modelBlock(schema, 'Attestation');
    for (const field of [
      'orgId',
      'repositoryId',
      'key',
      'answer Boolean',
      'note',
      'attestedBy',
      'attestedAt',
      'expiresAt',
      '@@unique([orgId, repositoryId, key])',
    ]) {
      expect(attestation).toContain(field);
    }
  });

  it('adds an additive, RLS-enabled migration', () => {
    expect(migration).toContain('ALTER TABLE scans');
    expect(migration).toContain('CREATE TABLE attestations');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('tenant_isolation_attestations');
    expect(migration).toContain("NULLIF(current_setting('app.current_org', true), '')::uuid");
  });

  it('migration performs no destructive or backfilling statements', () => {
    expect(migration).not.toContain('DROP');
    expect(migration).not.toContain('TRUNCATE');
    expect(migration).not.toContain('UPDATE scans');
    expect(migration).not.toContain('DELETE FROM');
  });
});

import { afterAll, expect, it } from 'vitest';
import { makeClient, describeDb } from './helpers/db.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const schema = readFileSync(`${root}prisma/schema.prisma`, 'utf8');

const TABLES = [
  'organizations',
  'users',
  'memberships',
  'membership_invites',
  'repositories',
  'api_keys',
  'scans',
  'scan_events',
  'dpdpa_rules',
  'rule_mappings',
  'scanner_findings',
  'remediation_logs',
  'reports',
  'audit_logs',
  'usage_events',
  'sessions',
];
const ENUMS = [
  'org_plan',
  'member_role',
  'membership_status',
  'repo_visibility',
  'scan_status',
  'scan_trigger',
  'scanner_name',
  'scanner_status',
  'finding_severity',
  'finding_status',
  'mapping_confidence',
  'report_status',
  'report_format',
];
const RLS_TABLES = ['repositories', 'scans', 'scanner_findings', 'reports', 'audit_logs'];

describeDb('initial migration', () => {
  const prisma = makeClient();
  afterAll(() => prisma.$disconnect());

  it('creates every table, enum, trigger, view, and RLS policy', async () => {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    for (const t of TABLES) expect(tables.map((r) => r.tablename)).toContain(t);

    const enums = await prisma.$queryRaw<{ typname: string }[]>`
      SELECT t.typname FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public'`;
    for (const e of ENUMS) expect(enums.map((r) => r.typname)).toContain(e);

    const triggers = await prisma.$queryRaw<{ tgname: string }[]>`
      SELECT tgname FROM pg_trigger WHERE NOT tgisinternal`;
    expect(triggers.map((r) => r.tgname)).toContain('trg_orgs_updated');

    const views = await prisma.$queryRaw<{ viewname: string }[]>`
      SELECT viewname FROM pg_views WHERE schemaname = 'public'`;
    expect(views.map((r) => r.viewname)).toEqual(
      expect.arrayContaining(['v_scan_overview', 'v_scan_section_scores']),
    );

    const rls = await prisma.$queryRaw<{ relname: string }[]>`
      SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relrowsecurity`;
    for (const t of RLS_TABLES) expect(rls.map((r) => r.relname)).toContain(t);

    const policies = await prisma.$queryRaw<{ policyname: string; qual: string }[]>`
      SELECT policyname, qual FROM pg_policies WHERE schemaname = 'public'`;
    expect(policies.length).toBe(5);
    // The NULLIF guard keeps a spent org GUC ('' after a SET LOCAL transaction
    // ends) from raising 22P02 on pooled connections (20261111000001).
    // pg_policies deparse may render NULLIF as its CASE equivalent.
    for (const p of policies) {
      if (p.policyname.startsWith('tenant_isolation_')) {
        const qual = p.qual.toLowerCase();
        expect(qual.includes('nullif') || qual.includes('case when')).toBe(true);
      }
    }
  });

  it('enum values in the database match schema.prisma exactly', async () => {
    const rows = await prisma.$queryRaw<{ typname: string; enumlabel: string }[]>`
      SELECT t.typname, e.enumlabel FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' ORDER BY t.typname, e.enumsortorder`;
    const dbEnums = new Map<string, string[]>();
    for (const row of rows) {
      dbEnums.set(row.typname, [...(dbEnums.get(row.typname) ?? []), row.enumlabel]);
    }
    const blocks = [...schema.matchAll(/enum \w+ \{([^}]*)\}/g)];
    expect(blocks.length).toBe(dbEnums.size);
    for (const [, body = ''] of blocks) {
      const mapName = body.match(/@@map\("(\w+)"\)/)?.[1];
      const values = body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('@@'));
      expect(dbEnums.get(mapName!), `enum ${mapName}`).toEqual(values);
    }
  });

  it('the updated_at trigger bumps the column on update', async () => {
    const org = await prisma.organization.create({
      data: { name: 'Trigger Test Org', slug: `trigger-test-${Date.now()}` },
    });
    const updated = await prisma.organization.update({
      where: { id: org.id },
      data: { name: 'Renamed' },
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(org.updatedAt.getTime());
    await prisma.organization.delete({ where: { id: org.id } });
  });

  it('rejects data that violates a CHECK constraint', async () => {
    await expect(
      prisma.organization.create({ data: { name: 'x', slug: 'bad slug!' } }),
    ).rejects.toThrow();
  });
});

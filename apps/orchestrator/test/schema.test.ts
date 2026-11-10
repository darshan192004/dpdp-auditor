import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('..', import.meta.url));
const schema = readFileSync(`${root}prisma/schema.prisma`, 'utf8');
const migration = readFileSync(
  `${root}prisma/migrations/20261110000000_init/migration.sql`,
  'utf8',
);

const ENUMS: Record<string, string[]> = {
  org_plan: ['free', 'starter', 'growth', 'enterprise'],
  member_role: ['owner', 'admin', 'auditor', 'viewer'],
  membership_status: ['invited', 'active', 'suspended'],
  repo_visibility: ['public', 'private', 'internal'],
  scan_status: [
    'queued',
    'cloning',
    'scanning',
    'mapping',
    'completed',
    'failed',
    'cancelled',
    'expired',
  ],
  scan_trigger: ['manual', 'api'],
  scanner_name: ['semgrep', 'checkov', 'gitleaks'],
  scanner_status: ['pending', 'running', 'completed', 'failed', 'timed_out', 'skipped'],
  finding_severity: ['critical', 'high', 'medium', 'low', 'info'],
  finding_status: ['open', 'false_positive', 'accepted_risk', 'fixed', 'reopened'],
  mapping_confidence: ['direct', 'inferred', 'advisory'],
  report_status: ['queued', 'rendering', 'ready', 'failed', 'expired'],
  report_format: ['pdf'],
};

const TABLES = [
  'organizations',
  'users',
  'memberships',
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

describe('prisma schema mirrors docs/database.md', () => {
  it('declares every enum with the exact values', () => {
    for (const [name, values] of Object.entries(ENUMS)) {
      const match = schema.match(new RegExp(`enum \\w+ \\{[^}]*@@map\\("${name}"\\)[^}]*\\}`, 's'));
      expect(match, `enum ${name} missing from schema.prisma`).toBeTruthy();
      for (const value of values) {
        expect(match![0], `${name}.${value}`).toContain(`  ${value}\n`);
      }
      expect(migration).toContain(`CREATE TYPE ${name} AS ENUM`);
    }
  });

  it('declares every table and maps it with @@map', () => {
    for (const table of TABLES) {
      expect(schema).toContain(`@@map("${table}")`);
      expect(migration).toContain(`CREATE TABLE ${table} (`);
    }
  });

  it('migration creates extensions, triggers, views, and RLS policies', () => {
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS citext');
    expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION set_updated_at()');
    expect(migration).toContain('CREATE TRIGGER trg_orgs_updated');
    expect(migration).toContain('CREATE VIEW v_scan_overview');
    expect(migration).toContain('CREATE VIEW v_scan_section_scores');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    for (const table of ['repositories', 'scans', 'scanner_findings', 'reports', 'audit_logs']) {
      expect(migration).toMatch(new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`));
    }
    expect(migration).toContain('CREATE POLICY tenant_isolation_audit');
  });
});

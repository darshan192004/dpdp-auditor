import { describe, expect, it } from 'vitest';

import { fixtureAuditLogList } from '../server/utils/fixtures/audit';
import { fixtureAttestations } from '../server/utils/fixtures/attestations';
import { fixtureFixPlan, fixtureGaps } from '../server/utils/fixtures/readiness';
import { getFixtureScan } from '../server/utils/fixtures/scans';

/** Synthetic v2 walkthrough identities. No source text, secrets, or canaries. */
const V2_SCAN_ID = '0f000000-0000-4000-8000-0000000000a1';
const V2_REPO_ID = '0f000000-0000-4000-8000-0000000000a2';
const OWNER_ID = '0f000000-0000-4000-8000-000000000003';

function assertSynthetic(value: unknown): void {
  const text = JSON.stringify(value);
  expect(text).not.toMatch(/CANARY/i);
  expect(text).not.toMatch(/BEGIN (RSA |EC )?PRIVATE KEY/);
  expect(text).not.toMatch(/api[_-]?key\s*[:=]/i);
}

describe('synthetic v2 walkthrough fixtures', () => {
  it('exposes a scoring-v2 scan with every readiness surface', () => {
    const scan = getFixtureScan(V2_SCAN_ID);
    expect(scan.scoringVersion).toBe('2.0.0');
    expect(typeof scan.score).toBe('number');
    expect(scan.grade).toBeNull();

    const assessment = scan.assessment;
    expect(assessment).not.toBeNull();
    expect(assessment?.score).toBeTypeOf('number');
    expect(assessment?.evidenceCoverage).toBeGreaterThan(0);
    expect(assessment?.evidenceCoverage).toBeLessThan(0.5);
    expect(assessment?.openGaps).toBeGreaterThan(0);
    expect(assessment?.consentGatingRatio).toBeGreaterThan(0);
    expect(
      (assessment?.verdictCounts.ATTESTED_PASS ?? 0) +
        (assessment?.verdictCounts.ATTESTED_FAIL ?? 0),
    ).toBeGreaterThan(0);
    expect(Object.values(assessment?.detectorStatuses ?? {})).toContain('timed_out');
    expect(assessment?.gradeWithheldReason).toBe('insufficient_evidence');
    assertSynthetic(scan);
  });

  it('keeps attestation verdicts out of gap evidence and never turns missing evidence into PASS', () => {
    const gaps = fixtureGaps(V2_SCAN_ID);
    const attested = gaps.filter((gap) => gap.verdict === 'ATTESTED_FAIL');
    expect(attested.length).toBeGreaterThan(0);
    for (const gap of attested) {
      expect(gap.evidence).toEqual([]);
      expect(gap.reasonCode).not.toMatch(/evidence/i);
    }
    expect(gaps.map((gap) => gap.verdict)).not.toContain('PASS');
    assertSynthetic(gaps);
  });

  it('lists the attested control in the fix plan', () => {
    const plan = fixtureFixPlan(V2_SCAN_ID);
    expect(plan.steps.map((step) => step.controlCode)).toContain('DPDPA-6-CONSENTGATE-01');
    assertSynthetic(plan);
  });

  it('exposes expiry state and an owner-written attestation', () => {
    const rows = fixtureAttestations(V2_REPO_ID);
    const now = Date.parse('2026-11-27T00:00:00.000Z');
    expect(rows.some((row) => row.expiresAt !== null && Date.parse(row.expiresAt) < now)).toBe(
      true,
    );
    expect(rows.some((row) => row.expiresAt !== null && Date.parse(row.expiresAt) > now)).toBe(
      true,
    );
    for (const row of rows) {
      expect(row.repositoryId).toBe(V2_REPO_ID);
      expect(row.attestedBy).toBe(OWNER_ID);
      expect(row.note?.toUpperCase()).not.toContain('CANARY');
    }
    assertSynthetic(rows);
  });

  it('records the attestation write in the audit trail', () => {
    const rows = fixtureAuditLogList({ actionContains: 'attestation' }).data;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((row) => row.action)).toContain('attestation.upserted');
    expect(rows[0]?.resource.type).toBe('attestation');
    expect(rows[0]?.actor.id).toBe(OWNER_ID);
    assertSynthetic(rows);
  });

  it('maps an owner fixture role so the write control is observable', async () => {
    const fixtures = (await import('~~/shared/fixtures')) as unknown as Record<string, unknown>;
    const roleFor = fixtures.fixtureRoleFor as
      ((value: string | null | undefined) => string) | undefined;
    expect(typeof roleFor).toBe('function');
    expect(roleFor?.('owner')).toBe('owner');
    expect(roleFor?.('admin')).toBe('admin');
    expect(roleFor?.(undefined)).toBe('auditor');
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { DpdpaRule, Prisma, ScannerFinding, Scan } from '@prisma/client';
import {
  FindingsService,
  sectionOf,
  toFindingView,
} from '../src/modules/findings/findings.service.js';
import { factsFrom } from '../src/modules/scoring/applicability.js';
import type { FindingsRepository } from '../src/modules/findings/findings.repository.js';
import type { ScansRepository } from '../src/modules/scans/scans.repository.js';
import type { ScanScoringService } from '../src/modules/scoring/scan-scoring.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { AuditService } from '../src/modules/audit/audit.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const FINDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = '22222222-2222-4222-9222-222222222222';

function rule(overrides: Partial<DpdpaRule> = {}): DpdpaRule {
  return {
    id: 'rule-1',
    code: 'DPDPA-8.4-LOG-01',
    section: '8(4)',
    title: 'Personal data must not be exposed in logs',
    summary: 'PII in logs',
    obligation: 'Reasonable safeguards',
    legalReference: 'DPDPA Section 8(4)',
    severity: 'critical',
    weight: { toString: () => '5' } as unknown as DpdpaRule['weight'],
    appliesWhen: {},
    remediationGuidance: 'Remove the PII from the log call.',
    version: 'dpdpa-2026.10.1',
    isActive: true,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

function finding(
  overrides: Partial<ScannerFinding & { dpdpaRule: DpdpaRule | null }> = {},
): ScannerFinding & { dpdpaRule: DpdpaRule | null } {
  return {
    id: FINDING_ID,
    scanId: SCAN_ID,
    orgId: ORG_ID,
    scanner: 'semgrep',
    scannerRuleId: 'dpdpa.python.pii-in-logs',
    scannerRuleVersion: '1.95.0',
    dpdpaRuleId: 'rule-1',
    controlCode: 'DPDPA-8.4-LOG-01',
    severity: 'critical',
    confidence: 'direct',
    filePath: 'services/payments/api/views.py',
    lineStart: 142,
    lineEnd: 149,
    columnStart: null,
    columnEnd: null,
    message: 'Personal data is written to application logs.',
    evidenceRedacted: 'logger.info("card=****4242")',
    evidenceHash: 'sha256:5f2c',
    fingerprint: 'fpt_1:DPDPA-8.4-LOG-01',
    status: 'open',
    isNew: true,
    firstSeenAt: new Date('2026-11-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-11-01T00:00:00.000Z'),
    context: { rationale: 'Logging personal data widens access.' },
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    dpdpaRule: rule(),
    ...overrides,
  };
}

function scan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: SCAN_ID,
    orgId: ORG_ID,
    repositoryId: '55555555-5555-4555-8555-555555555555',
    requestedBy: null,
    apiKeyId: null,
    trigger: 'manual',
    status: 'completed',
    ref: 'main',
    commitSha: null,
    scannerVersions: {},
    rulePackVersion: 'dpdpa-2026.10.1',
    scoringVersion: '1.0.0',
    score: null,
    grade: null,
    sectionScores: {},
    counts: {},
    coverage: { semgrep: 'completed' },
    coverageStatus: 'full',
    facts: { languages: ['python'], frameworks: [], resourceTypes: [] },
    errorCode: null,
    errorMessage: null,
    idempotencyKey: null,
    idempotencyHash: null,
    jobName: null,
    secretName: null,
    queuedAt: new Date('2026-11-01T00:00:00.000Z'),
    startedAt: null,
    completedAt: null,
    durationMs: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    ...overrides,
  };
}

function make(
  options: { existing?: ScannerFinding | null; items?: ReturnType<typeof finding>[] } = {},
) {
  const repo = {
    findById: vi.fn().mockResolvedValue(options.existing ?? null),
    list: vi.fn().mockResolvedValue({ items: options.items ?? [finding()], total: 1 }),
    update: vi.fn(async (_id: string, data: { status: string }) => ({
      ...finding(),
      status: data.status,
      updatedAt: new Date('2026-11-12T10:00:00.000Z'),
    })),
    addRemediationLog: vi.fn().mockResolvedValue({}),
  };
  const scans = {
    findById: vi.fn().mockResolvedValue(scan()),
    update: vi.fn().mockResolvedValue(scan()),
    appendEvent: vi.fn().mockResolvedValue({}),
  };
  const scoring = {
    scorePersisted: vi.fn().mockResolvedValue({
      loaded: { pack: 'dpdpa-2026.10.1', scoringVersion: '1.0.0' },
      result: {
        score: 88.5,
        grade: 'B',
        sectionScores: { '8(4)': 80 },
        counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
        coverage: 'full',
      },
    }),
  };
  const tx = {};
  const prisma = {
    $transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
  };
  const audit = { record: vi.fn().mockResolvedValue({}) };
  const service = new FindingsService(
    repo as unknown as FindingsRepository,
    scans as unknown as ScansRepository,
    scoring as unknown as ScanScoringService,
    prisma as unknown as PrismaService,
    audit as unknown as AuditService,
  );
  return { service, repo, scans, scoring, audit, tx };
}

describe('FindingsService.list (P4-17)', () => {
  it('returns the documented view model with pagination', async () => {
    const { service, repo } = make();

    const result = await service.list(ORG_ID, SCAN_ID, { page: 1, pageSize: 50 });

    expect(repo.list).toHaveBeenCalledWith(
      ORG_ID,
      expect.objectContaining({ orgId: ORG_ID, scanId: SCAN_ID, page: 1, pageSize: 50 }),
    );
    expect(result.data[0]).toMatchObject({
      id: FINDING_ID,
      severity: 'critical',
      confidence: 'direct',
      status: 'open',
      isNew: true,
      evidence: { redacted: 'logger.info("card=****4242")', hash: 'sha256:5f2c' },
      dpdpa: {
        code: 'DPDPA-8.4-LOG-01',
        section: '8(4)',
        title: 'Personal data must not be exposed in logs',
        rationale: 'Logging personal data widens access.',
      },
    });
    expect(result.pagination).toEqual({ page: 1, pageSize: 50, totalItems: 1, totalPages: 1 });
  });

  it('omits redacted evidence for secrets', async () => {
    const { service } = make({
      items: [finding({ scanner: 'gitleaks', controlCode: 'DPDPA-8.4-SECRET-01' })],
    });

    const result = await service.list(ORG_ID, SCAN_ID, {});
    expect(result.data[0]?.evidence).toEqual({ hash: 'sha256:5f2c' });
  });

  it('rejects a scan from another organisation', async () => {
    const { service, scans } = make();
    scans.findById.mockResolvedValue(null);

    await expect(service.list(ORG_ID, SCAN_ID, {})).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('FindingsService.triage (P4-18)', () => {
  it('writes the status, remediation log, audit row, and recomputed score together', async () => {
    const { service, repo, scans, scoring, audit, tx } = make({ existing: finding() });

    const result = await service.triage(ORG_ID, FINDING_ID, {
      status: 'accepted_risk',
      note: 'Accepted until the Q1 migration removes the legacy logger.',
      actorUserId: USER_ID,
    });

    expect(repo.update).toHaveBeenCalledWith(FINDING_ID, { status: 'accepted_risk' }, tx);
    expect(repo.addRemediationLog).toHaveBeenCalledWith(
      expect.objectContaining({
        findingId: FINDING_ID,
        orgId: ORG_ID,
        actorUserId: USER_ID,
        action: 'triage',
      }),
      tx,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'finding.triaged',
        resourceType: 'finding',
        resourceId: FINDING_ID,
        actorType: 'user',
        metadata: { from: 'open', to: 'accepted_risk', scanId: SCAN_ID },
      }),
      tx,
    );
    expect(scoring.scorePersisted).toHaveBeenCalledWith(
      expect.objectContaining({ id: SCAN_ID }),
      { languages: ['python'], frameworks: [], resourceTypes: [] },
      tx,
    );
    expect(scans.update).toHaveBeenCalledWith(
      SCAN_ID,
      expect.objectContaining({ grade: 'B', coverageStatus: 'full' }),
      tx,
    );
    expect(scans.appendEvent).toHaveBeenCalledWith(
      SCAN_ID,
      ORG_ID,
      'score_recomputed',
      expect.objectContaining({ score: 88.5, grade: 'B' }),
      tx,
    );
    expect(result).toMatchObject({
      id: FINDING_ID,
      status: 'accepted_risk',
      triage: { actor: USER_ID, at: new Date('2026-11-12T10:00:00.000Z') },
    });
  });

  it('requires a longer note for accepted_risk', async () => {
    const { service } = make({ existing: finding() });

    await expect(
      service.triage(ORG_ID, FINDING_ID, { status: 'accepted_risk', note: 'too short' }),
    ).rejects.toThrow(/at least 20 characters/);
  });

  it('requires a note for false_positive', async () => {
    const { service } = make({ existing: finding() });

    await expect(service.triage(ORG_ID, FINDING_ID, { status: 'false_positive' })).rejects.toThrow(
      /at least 10 characters/,
    );
  });

  it('rejects a finding from another organisation', async () => {
    const { service } = make({ existing: null });

    await expect(service.triage(ORG_ID, FINDING_ID, { status: 'open' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('view helpers', () => {
  it('derives the section from the control code', () => {
    expect(sectionOf('DPDPA-8.4-ENC-01')).toBe('8(4)');
    expect(sectionOf('DPDPA-6-CONSENT-01')).toBe('6');
  });

  it('keeps unmapped findings without a dpdpa block', () => {
    const view = toFindingView(finding({ controlCode: null, dpdpaRule: null }));
    expect(view.dpdpa).toBeNull();
  });

  it('reads repository facts defensively', () => {
    expect(factsFrom(null)).toEqual({ languages: [], frameworks: [], resourceTypes: [] });
    expect(factsFrom({ languages: ['go', 1] } as unknown as Prisma.JsonValue)).toEqual({
      languages: ['go'],
      frameworks: [],
      resourceTypes: [],
    });
  });
});

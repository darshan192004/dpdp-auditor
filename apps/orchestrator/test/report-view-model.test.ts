import { describe, expect, it } from 'vitest';
import type { Organization, Report, Repository, Scan } from '@prisma/client';
import {
  MAX_REPORT_FINDINGS,
  REPORT_DISCLAIMER,
  brandingFor,
  buildReportViewModel,
} from '../src/modules/reports/report-view-model.js';
import type { FindingWithRule } from '../src/modules/findings/findings.service.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const REPORT_ID = '99999999-9999-4999-8999-999999999999';

function organization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: ORG_ID,
    name: 'Acme',
    slug: 'acme',
    plan: 'free',
    dataRegion: 'ap-south-1',
    retentionDays: 90,
    scanConcurrency: 3,
    billingCustomerId: null,
    settings: {},
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function repository(overrides: Partial<Repository> = {}): Repository {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    orgId: ORG_ID,
    owner: 'acme',
    name: 'payments-service',
    githubRepoId: 1n,
    fullName: 'acme/payments-service',
    defaultBranch: 'main',
    visibility: 'private',
    language: 'Python',
    sizeKb: 1024,
    isArchived: false,
    connectedBy: null,
    lastScannedAt: null,
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function report(overrides: Partial<Report> = {}): Report {
  return {
    id: REPORT_ID,
    scanId: SCAN_ID,
    orgId: ORG_ID,
    status: 'ready',
    format: 'pdf',
    templateVersion: '2026.1',
    storageKey: null,
    sha256: null,
    sizeBytes: null,
    requestedBy: null,
    errorMessage: null,
    expiresAt: null,
    createdAt: new Date('2026-11-12T00:00:00.000Z'),
    updatedAt: new Date('2026-11-12T00:00:00.000Z'),
    ...overrides,
  };
}

function scan(overrides: Partial<Scan> = {}): Scan & { repository: Repository } {
  return {
    id: SCAN_ID,
    orgId: ORG_ID,
    repositoryId: repository().id,
    requestedBy: null,
    apiKeyId: null,
    trigger: 'manual',
    status: 'completed',
    ref: 'main',
    commitSha: 'a'.repeat(40),
    scannerVersions: { semgrep: '1.95.0' },
    rulePackVersion: 'dpdpa-2026.10.1',
    scoringVersion: '1.0.0',
    score: { toString: () => '70.95' } as unknown as Scan['score'],
    grade: 'C',
    sectionScores: { '8(4)': 47.62 },
    counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
    coverage: { semgrep: 'completed' },
    coverageStatus: 'full',
    facts: { languages: ['python'], frameworks: [], resourceTypes: [] },
    errorCode: null,
    errorMessage: null,
    idempotencyKey: null,
    idempotencyHash: null,
    jobName: null,
    secretName: null,
    queuedAt: new Date('2026-11-12T00:00:00.000Z'),
    startedAt: new Date('2026-11-12T00:00:01.000Z'),
    completedAt: new Date('2026-11-12T00:01:01.000Z'),
    durationMs: 60_000,
    createdAt: new Date('2026-11-12T00:00:00.000Z'),
    updatedAt: new Date('2026-11-12T00:01:01.000Z'),
    repository: repository(),
    ...overrides,
  };
}

function finding(overrides: Partial<FindingWithRule> = {}): FindingWithRule {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
    dpdpaRule: null,
    ...overrides,
  } as FindingWithRule;
}

describe('buildReportViewModel (P4-20)', () => {
  it('assembles the documented payload with the disclaimer and methodology', () => {
    const view = buildReportViewModel({
      report: report(),
      scan: scan(),
      organization: organization(),
      findings: [finding()],
      now: new Date('2026-11-12T10:00:00.000Z'),
    });

    expect(view.report).toMatchObject({ id: REPORT_ID, format: 'pdf', templateVersion: '2026.1' });
    expect(view.organization).toMatchObject({
      id: ORG_ID,
      name: 'Acme',
      slug: 'acme',
      dataRegion: 'ap-south-1',
    });
    expect(view.scan).toMatchObject({
      id: SCAN_ID,
      score: 70.95,
      grade: 'C',
      coverageStatus: 'full',
      repository: { fullName: 'acme/payments-service', visibility: 'private' },
    });
    expect(view.topFindings).toHaveLength(1);
    expect(view.topFindings[0]).toMatchObject({
      id: finding().id,
      dpdpa: { code: 'DPDPA-8.4-LOG-01', section: '8(4)' },
    });
    expect(view.methodology).toMatchObject({
      scoringVersion: '1.0.0',
      rulePackVersion: 'dpdpa-2026.10.1',
    });
    expect(view.disclaimer).toBe(REPORT_DISCLAIMER);
    expect(view.generatedAt).toEqual(new Date('2026-11-12T10:00:00.000Z'));
  });

  it('caps the finding list', () => {
    const findings = Array.from({ length: MAX_REPORT_FINDINGS + 5 }, () => finding());

    const view = buildReportViewModel({
      report: report(),
      scan: scan(),
      organization: organization(),
      findings,
    });

    expect(view.topFindings).toHaveLength(MAX_REPORT_FINDINGS);
  });

  it('keeps a null score for an unscored scan', () => {
    const view = buildReportViewModel({
      report: report(),
      scan: scan({ score: null, grade: null }),
      organization: organization(),
      findings: [],
    });

    expect(view.scan.score).toBeNull();
    expect(view.scan.grade).toBeNull();
  });
});

describe('brandingFor', () => {
  it('reads tenant branding from settings', () => {
    expect(
      brandingFor({
        branding: { logoUrl: 'https://cdn.example/logo.png', primaryColor: '#123456' },
      }),
    ).toEqual({
      logoUrl: 'https://cdn.example/logo.png',
      primaryColor: '#123456',
      footerText: null,
    });
  });

  it('falls back to nulls for absent or malformed settings', () => {
    expect(brandingFor({})).toEqual({ logoUrl: null, primaryColor: null, footerText: null });
    expect(brandingFor(null)).toEqual({ logoUrl: null, primaryColor: null, footerText: null });
    expect(brandingFor({ branding: 'nope' })).toEqual({
      logoUrl: null,
      primaryColor: null,
      footerText: null,
    });
    expect(brandingFor({ branding: { logoUrl: 42 } })).toEqual({
      logoUrl: null,
      primaryColor: null,
      footerText: null,
    });
  });
});

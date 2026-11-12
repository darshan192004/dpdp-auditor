import { describe, expect, it, vi } from 'vitest';
import type { Organization, Report, Repository, Scan } from '@prisma/client';
import { ReportsService } from '../src/modules/reports/reports.service.js';
import type { ReportsRepository } from '../src/modules/reports/reports.repository.js';
import type { FindingsRepository } from '../src/modules/findings/findings.repository.js';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const SCAN_ID = '88888888-8888-4888-8888-888888888888';
const REPORT_ID = '99999999-9999-4999-8999-999999999999';

const ORGANIZATION = {
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
} as unknown as Organization;

const REPOSITORY = {
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
} as unknown as Repository;

function report(overrides: Partial<Report> = {}): Report & {
  scan: Scan & { repository: Repository };
  organization: Organization;
} {
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
    scan: {
      id: SCAN_ID,
      orgId: ORG_ID,
      repositoryId: REPOSITORY.id,
      status: 'completed',
      score: null,
      grade: null,
      sectionScores: {},
      counts: {},
      coverage: {},
      coverageStatus: 'full',
      repository: REPOSITORY,
    } as unknown as Scan & { repository: Repository },
    organization: ORGANIZATION,
    ...overrides,
  };
}

function make(found: ReturnType<typeof report> | null = report()) {
  const reports = { findById: vi.fn().mockResolvedValue(found) };
  const findings = { topForScan: vi.fn().mockResolvedValue([]) };
  const service = new ReportsService(
    reports as unknown as ReportsRepository,
    findings as unknown as FindingsRepository,
  );
  return { service, reports, findings };
}

describe('ReportsService (P4-20)', () => {
  it('loads the report, its findings, and returns the view model', async () => {
    const { service, reports, findings } = make();

    const view = await service.viewModel(ORG_ID, REPORT_ID);

    expect(reports.findById).toHaveBeenCalledWith(ORG_ID, REPORT_ID);
    expect(findings.topForScan).toHaveBeenCalledWith(SCAN_ID, ORG_ID);
    expect(view).toMatchObject({
      report: { id: REPORT_ID },
      organization: { slug: 'acme' },
      scan: { id: SCAN_ID },
    });
  });

  it('rejects an unknown or foreign report', async () => {
    const { service, findings } = make(null);

    await expect(service.viewModel(ORG_ID, REPORT_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(findings.topForScan).not.toHaveBeenCalled();
  });

  it('rejects an expired report', async () => {
    const { service, findings } = make(report({ status: 'expired' }));

    await expect(service.viewModel(ORG_ID, REPORT_ID)).rejects.toMatchObject({
      code: 'REPORT_EXPIRED',
    });
    expect(findings.topForScan).not.toHaveBeenCalled();
  });
});

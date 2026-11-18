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
  const reports = {
    findById: vi.fn().mockResolvedValue(found),
    findByScanId: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    markComplete: vi.fn(),
    markRendering: vi.fn(),
    markFailed: vi.fn(),
    countCreatedSince: vi.fn().mockResolvedValue(0),
  };
  const findings = { topForScan: vi.fn().mockResolvedValue([]) };
  const scans = { findById: vi.fn(), recordUsage: vi.fn().mockResolvedValue(true) };
  const audit = { record: vi.fn() };
  const queue = { enqueue: vi.fn() };
  const storage = {
    upload: vi.fn().mockReturnValue({
      storageKey: 'reports/rpt.pdf',
      sha256: 'abc',
      sizeBytes: 100,
      expiresAt: new Date(),
      downloadUrl: 'https://example.com/signed',
    }),
    signedUrl: vi.fn().mockReturnValue('https://example.com/signed'),
  };
  const organizations = {
    findById: vi.fn().mockResolvedValue({ id: ORG_ID, plan: 'enterprise', slug: 'acme' }),
  };
  const email = { sendReportReady: vi.fn().mockResolvedValue(undefined) };
  const service = new ReportsService(
    reports as unknown as ReportsRepository,
    findings as unknown as FindingsRepository,
    scans as unknown as ConstructorParameters<typeof ReportsService>[2],
    audit as unknown as ConstructorParameters<typeof ReportsService>[3],
    queue as unknown as ConstructorParameters<typeof ReportsService>[4],
    storage as unknown as ConstructorParameters<typeof ReportsService>[5],
    organizations as unknown as ConstructorParameters<typeof ReportsService>[6],
    email as unknown as ConstructorParameters<typeof ReportsService>[7],
  );
  return { service, reports, findings, scans, audit, queue, storage, organizations, email };
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

describe('report lifecycle', () => {
  const input = { orgId: ORG_ID, scanId: SCAN_ID, template: 'standard' as const };
  it('rejects absent and unfinished scans without queueing', async () => {
    const m = make();
    await expect(m.service.request(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    m.scans.findById.mockResolvedValue({ status: 'running' });
    await expect(m.service.request(input)).rejects.toMatchObject({ code: 'SCAN_NOT_READY' });
    expect(m.queue.enqueue).not.toHaveBeenCalled();
  });
  it('reuses a ready report without consuming quota or queueing', async () => {
    const m = make();
    m.scans.findById.mockResolvedValue({ status: 'completed' });
    m.reports.findByScanId.mockResolvedValue(report());
    expect(await m.service.request(input)).toMatchObject({ id: REPORT_ID, status: 'ready' });
    expect(m.organizations.findById).not.toHaveBeenCalled();
    expect(m.queue.enqueue).not.toHaveBeenCalled();
  });
  it('enforces organization existence and monthly quota', async () => {
    const m = make();
    m.scans.findById.mockResolvedValue({ status: 'completed' });
    m.organizations.findById.mockResolvedValueOnce(null);
    await expect(m.service.request(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    m.organizations.findById.mockResolvedValue({ plan: 'free' });
    m.reports.countCreatedSince.mockResolvedValue(999);
    await expect(m.service.request(input)).rejects.toMatchObject({ code: 'PLAN_LIMIT_EXCEEDED' });
    expect(m.reports.create).not.toHaveBeenCalled();
  });
  it.each(['free', 'enterprise'])('queues a report within the %s plan allowance', async (plan) => {
    const m = make();
    m.scans.findById.mockResolvedValue({ status: 'completed' });
    m.organizations.findById.mockResolvedValue({ plan });
    m.reports.findByScanId.mockResolvedValue(report({ status: 'failed' }));
    m.reports.create.mockResolvedValue(report({ status: 'queued' }));
    expect(await m.service.request(input)).toMatchObject({ status: 'queued' });
    expect(m.queue.enqueue).toHaveBeenCalledWith('report.render', 'render', {
      reportId: REPORT_ID,
      orgId: ORG_ID,
      scanId: SCAN_ID,
      template: 'standard',
    });
    expect(m.reports.countCreatedSince).toHaveBeenCalledTimes(plan === 'enterprise' ? 0 : 1);
  });
  it.each(['status', 'downloadUrl', 'downloadFile', 'markRendering', 'complete'] as const)(
    'rejects missing reports for %s',
    async (method) => {
      const m = make(null);
      await expect(m.service[method](ORG_ID, REPORT_ID, {})).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(m.storage.upload).not.toHaveBeenCalled();
    },
  );
  it('returns status metadata and fallbacks without signing absent storage', async () => {
    const m = make();
    expect(await m.service.status(ORG_ID, REPORT_ID)).toMatchObject({
      sizeBytes: 0,
      downloadUrl: undefined,
    });
    expect(m.storage.signedUrl).not.toHaveBeenCalled();
    m.reports.findById.mockResolvedValue(
      report({ sizeBytes: 42n, sha256: 'hash', storageKey: 'key', expiresAt: new Date(0) }),
    );
    expect(await m.service.status(ORG_ID, REPORT_ID)).toMatchObject({
      sizeBytes: 42,
      sha256: 'hash',
      downloadUrl: 'https://example.com/signed',
      expiresAt: new Date(0),
    });
    for (const errorMessage of [null, 'renderer crashed']) {
      m.reports.findById.mockResolvedValue(report({ status: 'failed', errorMessage }));
      expect(await m.service.status(ORG_ID, REPORT_ID)).toMatchObject({
        error: errorMessage ?? 'Rendering failed.',
      });
    }
    m.reports.findById.mockResolvedValue(report({ status: 'queued' }));
    expect(await m.service.status(ORG_ID, REPORT_ID)).not.toHaveProperty('downloadUrl');
  });
  it('only audits downloads for ready reports with storage', async () => {
    const m = make(report({ status: 'queued' }));
    await expect(m.service.downloadUrl(ORG_ID, REPORT_ID)).rejects.toMatchObject({
      code: 'REPORT_NOT_READY',
    });
    m.reports.findById.mockResolvedValue(report());
    await expect(m.service.downloadUrl(ORG_ID, REPORT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(m.audit.record).not.toHaveBeenCalled();
    m.reports.findById.mockResolvedValue(report({ storageKey: 'key' }));
    expect(await m.service.downloadUrl(ORG_ID, REPORT_ID)).toBe('https://example.com/signed');
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        resourceId: REPORT_ID,
        action: 'report.downloaded',
      }),
    );
  });
  it('streams the stored PDF bytes for local downloads and audits them once', async () => {
    const m = make(report({ storageKey: 'reports/rpt.pdf' }));
    const pdf = Buffer.from('%PDF-1.4 local download');
    m.storage.read = vi.fn().mockReturnValue(pdf);

    expect(await m.service.downloadFile(ORG_ID, REPORT_ID)).toEqual({
      content: pdf,
      filename: `dpdpa-report-${REPORT_ID}.pdf`,
    });
    expect(m.storage.read).toHaveBeenCalledWith('reports/rpt.pdf');
    expect(m.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG_ID,
        resourceId: REPORT_ID,
        action: 'report.downloaded',
      }),
    );
  });

  it('fails closed when a ready report has no readable file', async () => {
    const m = make(report({ storageKey: 'reports/rpt.pdf' }));
    m.storage.read = vi.fn().mockReturnValue(null);
    await expect(m.service.downloadFile(ORG_ID, REPORT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('records rendering and failure transitions', async () => {
    const m = make();
    await m.service.markRendering(ORG_ID, REPORT_ID);
    expect(m.reports.markRendering).toHaveBeenCalledWith(REPORT_ID);
    await m.service.markFailed(REPORT_ID, 'failed');
    expect(m.reports.markFailed).toHaveBeenCalledWith(REPORT_ID, 'failed');
  });
  it.each([true, false])(
    'stores completed PDFs and records usage (organization present: %s)',
    async (exists) => {
      const m = make();
      if (!exists) m.organizations.findById.mockResolvedValue(null);
      const pdf = Buffer.from('%PDF-test');
      expect(
        await m.service.complete(ORG_ID, REPORT_ID, { buffer: pdf.toString('base64') }),
      ).toMatchObject({ status: 'ready' });
      expect(m.storage.upload).toHaveBeenCalledWith(REPORT_ID, pdf);
      expect(m.reports.markComplete).toHaveBeenCalledWith(
        REPORT_ID,
        expect.objectContaining({ sizeBytes: 100n }),
      );
      expect(m.scans.recordUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: ORG_ID,
          scanId: SCAN_ID,
          eventType: 'report_rendered',
          quantity: 1,
        }),
      );
      expect(m.email.sendReportReady).toHaveBeenCalledTimes(exists ? 1 : 0);
    },
  );
  it('rejects malformed renderer callbacks before storage writes', async () => {
    const m = make();
    await expect(m.service.complete(ORG_ID, REPORT_ID, {})).rejects.toThrow();
    expect(m.storage.upload).not.toHaveBeenCalled();
  });
});

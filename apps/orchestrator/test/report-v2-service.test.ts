import { describe, expect, it, vi } from 'vitest';
import { ReportV2Service } from '../src/modules/reports/report-v2.service.js';

const ORG_ID = 'org_1';
const REPORT_ID = 'rpt_1';
const SCAN_ID = 'scn_1';

/** Prisma decimal fields expose toString(); the service converts them to numbers. */
function decimal(value: string) {
  return { toString: () => value } as unknown as { toString(): string };
}

function makeReport(scanOverrides: Record<string, unknown> = {}) {
  return {
    id: REPORT_ID,
    scanId: SCAN_ID,
    orgId: ORG_ID,
    status: 'ready',
    format: 'pdf',
    templateVersion: '2.0.0',
    createdAt: new Date('2026-11-27T10:00:00.000Z'),
    scan: {
      id: SCAN_ID,
      repository: { id: 'repo_1', fullName: 'acme/repo', visibility: 'private' },
      ref: 'main',
      commitSha: null,
      status: 'completed',
      score: null,
      grade: null,
      sectionScores: {},
      counts: {},
      coverage: {},
      coverageStatus: 'full',
      evidenceCoverage: null,
      scannerVersions: { gitleaks: '8.28.0' },
      rulePackVersion: 'dpdpa-2026.11.0',
      scoringVersion: 'scoring-2.0.0',
      facts: {},
      inventoryVersion: null,
      inventoryStatus: null,
      consentGatingRatio: null,
      queuedAt: new Date('2026-11-27T09:00:00.000Z'),
      startedAt: null,
      completedAt: new Date('2026-11-27T09:01:00.000Z'),
      durationMs: 60_000,
      ...scanOverrides,
    },
    organization: {
      id: ORG_ID,
      name: 'Acme',
      slug: 'acme',
      dataRegion: 'in',
      settings: null,
    },
  };
}

function make(scanOverrides: Record<string, unknown> = {}) {
  const report = makeReport(scanOverrides);
  const prisma = {
    controlResult: {
      findMany: vi.fn().mockResolvedValue([
        {
          controlCode: 'DPDPA-8.4-SECRET-01',
          verdict: 'FAIL',
          reasonCode: 'cited_gap',
          rule: {
            section: '8(4)',
            remediationGuidance: 'Use a managed credential store.',
          },
        },
      ]),
    },
  };
  const reports = { findById: vi.fn().mockResolvedValue(report) };
  const findings = { topForScan: vi.fn().mockResolvedValue([]) };
  const pack = {
    loadV2: vi.fn().mockResolvedValue({
      commencement: [
        {
          provision: '8(4)',
          effectiveFrom: '2025-11-13',
          sourceUrl: 'https://example.test/8-4',
          verifiedOn: '2026-11-01',
        },
      ],
      controls: [
        {
          violationRules: [{ provenance: { search: 'secret-detector-v1' } }],
        },
      ],
    }),
  };
  const service = new ReportV2Service(
    prisma as never,
    reports as never,
    findings as never,
    pack as never,
  );
  return { service, report, prisma, reports, findings, pack };
}

describe('ReportV2Service', () => {
  it('throws NOT_FOUND when the report does not exist for the tenant', async () => {
    const { service, reports } = make();
    reports.findById.mockResolvedValue(null);

    await expect(service.viewModel(ORG_ID, REPORT_ID)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('keeps metrics null when evidence is absent', async () => {
    const { service, prisma, pack } = make();

    const result = await service.viewModel(ORG_ID, REPORT_ID);

    expect(result.scan.evidenceCoverage).toBeNull();
    const inventory = result.sections.find((s) => s.id === 'data_inventory_summary');
    expect(inventory?.text).toContain('0 bounded signals at unknown version');
    expect(inventory?.text).toContain('consent gating not determined');
    expect(prisma.controlResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { scanId: SCAN_ID, orgId: ORG_ID } }),
    );
    expect(pack.loadV2).toHaveBeenCalledOnce();
  });

  it('maps decimal metrics and bounded inventory signals into the view model', async () => {
    const { service } = make({
      evidenceCoverage: decimal('42.5'),
      consentGatingRatio: decimal('60.5'),
      inventoryVersion: 'v2',
      inventoryStatus: 'complete',
      facts: {
        inventory: {
          signals: [
            {
              detector: 'email_address',
              kind: 'identifier',
              path: 'src/api/user.ts',
              line: 12,
              token: 'email_address',
            },
          ],
        },
      },
    });

    const result = await service.viewModel(ORG_ID, REPORT_ID);

    expect(result.scan.evidenceCoverage).toBe(42.5);
    const inventory = result.sections.find((s) => s.id === 'data_inventory_summary');
    expect(inventory?.text).toContain('1 bounded signals at v2');
    expect(inventory?.text).toContain('consent gating 60.5');
    const methodology = result.sections.find((s) => s.id === 'methodology');
    expect(methodology?.text).toContain('secret-detector-v1');
    expect(result.sections.find((s) => s.id === 'executive_summary')?.table).toHaveLength(1);
  });
});

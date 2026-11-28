import { describe, expect, it, vi } from 'vitest';
import { ReportsService } from '../src/modules/reports/reports.service.js';

function service(scoringVersion: string, v2: unknown) {
  const report = {
    id: 'rpt_1',
    orgId: 'org_1',
    scanId: 'scn_1',
    templateVersion: '2.0.0',
    format: 'pdf',
    createdAt: '2026-11-27T10:00:00.000Z',
    status: 'ready',
    scan: {
      scoringVersion,
      id: 'scn_1',
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
      scannerVersions: {},
      rulePackVersion: 'dpdpa-2026.11.0',
      queuedAt: '2026-11-27T09:00:00.000Z',
      startedAt: null,
      completedAt: '2026-11-27T09:01:00.000Z',
      durationMs: 60_000,
    },
    organization: {
      id: 'org_1',
      name: 'Acme',
      slug: 'acme',
      dataRegion: 'in',
      settings: null,
    },
  };
  const reports = { findById: vi.fn().mockResolvedValue(report) };
  const findings = { topForScan: vi.fn().mockResolvedValue([]) };
  const base = new ReportsService(
    reports as never,
    findings as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    v2 as never,
  );
  return base;
}

describe('report version selection', () => {
  it('uses the v2 service only for scoring-2.0.0 scans', async () => {
    const v2 = { viewModel: vi.fn().mockResolvedValue({ sections: [] }) };
    const selected = await service('scoring-2.0.0', v2).viewModel('org_1', 'rpt_1');
    expect(selected).toEqual({ sections: [] });
    expect(v2.viewModel).toHaveBeenCalledWith('org_1', 'rpt_1');
  });

  it('keeps the v1 payload for legacy scans', async () => {
    const v2 = { viewModel: vi.fn().mockResolvedValue({ sections: [] }) };
    const legacy = await service('1.0.0', v2).viewModel('org_1', 'rpt_1');
    expect(v2.viewModel).not.toHaveBeenCalled();
    expect(legacy).toMatchObject({
      report: { id: 'rpt_1' },
      methodology: { scoringVersion: '1.0.0' },
    });
  });
});

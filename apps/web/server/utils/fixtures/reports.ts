import type { ScanDetail } from '~~/shared/scan';
import { FIXTURE_SCAN_ID } from './findings';

/** P5-18/P5-21/P5-22: report fixtures for dev/CI (docs/api.md 6.1-6.3, 10.6). */

export const FIXTURE_REPORT_ID = 'rpt_01J8Z6C3D4E5F6G7H8J9K0M1N2';

export function fixtureReportRequest(scanId: string = FIXTURE_SCAN_ID) {
  return {
    id: FIXTURE_REPORT_ID,
    scanId,
    status: 'ready',
    format: 'standard',
    createdAt: '2026-11-04T10:05:00.000Z',
    links: { self: `/api/v1/report/pdf/${FIXTURE_REPORT_ID}` },
  };
}

export function fixtureReportStatus() {
  return {
    id: FIXTURE_REPORT_ID,
    scanId: FIXTURE_SCAN_ID,
    status: 'ready',
    format: 'standard',
    createdAt: '2026-11-04T10:05:00.000Z',
    sizeBytes: 482_113,
    sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    completedAt: '2026-11-04T10:05:06.342Z',
    expiresAt: '2026-11-11T10:05:06.342Z',
  };
}

const DISCLAIMER =
  'The mapping is a technical aid. It is not legal advice, not a legal opinion, and not a ' +
  'certification of compliance. DPDPA obligations depend on facts outside the repository, ' +
  'including notices, consents, contracts, and processing purposes. Customers must validate ' +
  'findings with qualified counsel.';

const METHODOLOGY =
  'Scores are derived from the signed DPDPA rule pack. Each applicable control contributes its ' +
  'weight to its section; a section score is the share of applicable weight without an active ' +
  'finding. The overall score is the weighted mean of assessed sections. A scan with incomplete ' +
  'scanner coverage reports a provisional score and withholds the grade.';

/** Full report view model (api.md 10.6) for the HTML preview route. */
export function fixtureReportViewModel(scan: ScanDetail) {
  return {
    report: {
      id: FIXTURE_REPORT_ID,
      format: 'standard',
      templateVersion: '1.0.0',
      createdAt: '2026-11-04T10:05:00.000Z',
    },
    organization: {
      id: '0f000000-0000-4000-8000-000000000001',
      name: 'Acme Payments',
      slug: 'acme-payments',
      dataRegion: 'in',
      branding: { logoUrl: null, primaryColor: null, footerText: null },
    },
    scan: {
      id: scan.id,
      repository: scan.repository,
      ref: scan.ref,
      commitSha: scan.commitSha,
      status: scan.status,
      score: scan.score,
      grade: scan.grade,
      sectionScores: scan.sectionScores,
      counts: scan.counts,
      coverage: scan.coverage,
      coverageStatus: 'full',
      scannerVersions: scan.scannerVersions,
      rulePackVersion: scan.rulePackVersion,
      scoringVersion: scan.scoringVersion,
      timestamps: scan.timestamps,
    },
    topFindings: [],
    methodology: {
      scoringVersion: scan.scoringVersion,
      rulePackVersion: scan.rulePackVersion,
      summary: METHODOLOGY,
    },
    disclaimer: DISCLAIMER,
    generatedAt: '2026-11-04T10:05:06.342Z',
  };
}

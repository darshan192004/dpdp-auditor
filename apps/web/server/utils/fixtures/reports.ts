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
    downloadUrl: `/api/v1/report/pdf/${FIXTURE_REPORT_ID}/content`,
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
      templateVersion: '2.0.0',
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
      evidenceCoverage: 0,
      scannerVersions: scan.scannerVersions,
      rulePackVersion: scan.rulePackVersion,
      scoringVersion: 'scoring-2.0.0',
      assessment: {
        score: scan.score,
        evidenceCoverage: 0,
        openGaps: 1,
        verdictCounts: { UNKNOWN: 1 },
        unknownControls: ['DPDPA-9-CHILD-01'],
        detectorStatuses: {
          semgrep: 'completed',
          checkov: 'completed',
          gitleaks: 'completed',
        },
        gradeWithheldReason: 'insufficient_evidence',
        consentGatingRatio: 0.75,
      },
      timestamps: scan.timestamps,
    },
    topFindings: [],
    methodology: {
      scoringVersion: 'scoring-2.0.0',
      rulePackVersion: scan.rulePackVersion,
      summary: METHODOLOGY,
    },
    disclaimer: DISCLAIMER,
    generatedAt: '2026-11-04T10:05:06.342Z',
    scoringVersion: 'scoring-2.0.0',
    sections: [
      {
        id: 'executive_summary',
        title: 'Executive readiness summary',
        rows: [
          {
            section: 'score',
            remedy: scan.score === null ? 'Not assessed' : scan.score.toFixed(1),
          },
          { section: 'evidence coverage', remedy: '0' },
          { section: 'open gaps', remedy: '1' },
        ],
        table: [
          {
            provision: 'DPDP Rules 4',
            effectiveFrom: '2026-11-13',
            sourceUrl: 'https://www.meity.gov.in/example.pdf',
            verifiedOn: '2026-11-26',
          },
        ],
      },
      {
        id: 'gaps_by_section',
        title: 'Gaps grouped by section',
        groups: [
          {
            section: '8(4)',
            rows: [
              {
                controlCode: 'DPDPA-8.4-ENC-01',
                verdict: 'FAIL',
                reasonCode: 'gap_evidence',
              },
            ],
          },
        ],
      },
      {
        id: 'evidence_of_safeguards',
        title: 'Evidence of safeguards',
        rows: [],
      },
      {
        id: 'could_not_determine',
        title: 'Could not determine',
        rows: [
          {
            controlCode: 'DPDPA-9-CHILD-01',
            section: '9',
            reasonCode: 'detector_unavailable',
          },
        ],
      },
      {
        id: 'data_inventory_summary',
        title: 'Data inventory summary',
        text: '1 bounded signal at inventory-1.0.0; consent gating 0.75.',
      },
      {
        id: 'fix_plan',
        title: 'Fix plan',
        rows: [
          {
            controlCode: 'DPDPA-8.4-ENC-01',
            section: '8(4)',
            remedy: 'Use a managed credential store.',
          },
        ],
      },
      {
        id: 'methodology',
        title: 'Methodology and provenance',
        text: 'Detector versions: {"semgrep":"1.95.0"}. Searches: dpdp act section 8(4) safeguards.',
      },
      {
        id: 'limitations',
        title: 'Limitations',
        text: 'Repository evidence cannot establish notices, consents, contracts, or processing purposes. Unavailable detectors remain unknown.',
      },
      {
        id: 'disclaimer',
        title: 'Disclaimer',
        text: DISCLAIMER,
      },
    ],
  };
}

/** Explicit sample PDF, used only by the guarded development fixture routes. */
export function fixtureReportPdf(): Buffer {
  const stream = 'BT /F1 16 Tf 40 750 Td (Development fixture report - sample data only) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

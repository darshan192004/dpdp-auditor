import { describe, expect, it } from 'vitest';
import type { ReportTemplateModel } from '../src/modules/reports/report-template.js';
import {
  buildReportV2ViewModel,
  REPORT_V2_SECTION_IDS,
  type ReportV2Input,
} from '../src/modules/reports/report-view-model-v2.js';

function base(): ReportTemplateModel {
  return {
    report: {
      id: 'rpt_1',
      format: 'pdf',
      templateVersion: '2.0.0',
      createdAt: '2026-11-27T10:00:00.000Z',
    },
    organization: {
      name: 'Acme',
      slug: 'acme',
      dataRegion: 'ap-south-1',
      branding: { logoUrl: null, primaryColor: null, footerText: null },
    },
    scan: {
      id: 'scn_1',
      repository: { fullName: 'acme/repo', visibility: 'private' },
      ref: 'main',
      commitSha: 'a'.repeat(40),
      status: 'completed',
      score: null,
      grade: null,
      sectionScores: { '8(4)': 50 },
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      coverage: { gitleaks: 'timed_out' },
      coverageStatus: 'partial',
      scannerVersions: { gitleaks: '8.28.0' },
      rulePackVersion: 'dpdpa-2026.11.0',
      scoringVersion: 'scoring-2.0.0',
      timestamps: {
        queuedAt: '2026-11-27T09:00:00.000Z',
        startedAt: '2026-11-27T09:00:10.000Z',
        completedAt: '2026-11-27T09:01:00.000Z',
        durationMs: 50_000,
      },
    },
    topFindings: [],
    methodology: {
      scoringVersion: 'scoring-2.0.0',
      rulePackVersion: 'dpdpa-2026.11.0',
      summary: 'Versioned readiness scoring.',
    },
    disclaimer: 'Technical aid only; not legal advice.',
    generatedAt: '2026-11-27T10:00:00.000Z',
  };
}

function input(overrides: Partial<ReportV2Input> = {}): ReportV2Input {
  return {
    base: base(),
    controlResults: [
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        verdict: 'FAIL',
        reasonCode: 'cited_gap',
        remediation: 'Use a managed credential store.',
      },
      {
        controlCode: 'DPDPA-6-CONSENT-01',
        section: '6',
        verdict: 'ATTESTED_PASS',
        reasonCode: 'attested_pass',
        remediation: 'None.',
      },
      {
        controlCode: 'DPDPA-9-CHILD-01',
        section: '9',
        verdict: 'UNKNOWN',
        reasonCode: 'detector_unavailable',
        remediation: 'Add a detector.',
      },
      {
        controlCode: 'DPDPA-7-LEGIT-01',
        section: '7',
        verdict: 'PASS',
        reasonCode: 'positive_evidence',
        remediation: 'None.',
      },
    ],
    inventory: {
      version: 'inventory-1.0.0',
      status: 'completed',
      signals: [
        {
          detector: 'form_scan',
          kind: 'field',
          path: 'src/api/user.ts',
          line: 12,
          token: 'email_address',
        },
      ],
      consentGatingRatio: 0.75,
    },
    commencement: [
      {
        provision: 'DPDP Rules 4',
        effectiveFrom: '2026-11-13',
        sourceUrl: 'https://www.meity.gov.in/example.pdf',
        verifiedOn: '2026-11-26',
      },
    ],
    detectorVersions: { gitleaks: '8.28.0' },
    provenanceSearches: ['dpdp act section 8(4) safeguards'],
    ...overrides,
  };
}

describe('report v2 view model', () => {
  it('emits every required section in a stable order', () => {
    const model = buildReportV2ViewModel(input());
    expect(model.sections.map((section) => section.id)).toEqual(REPORT_V2_SECTION_IDS);
    expect(REPORT_V2_SECTION_IDS).toEqual([
      'executive_summary',
      'gaps_by_section',
      'evidence_of_safeguards',
      'could_not_determine',
      'data_inventory_summary',
      'fix_plan',
      'methodology',
      'limitations',
      'disclaimer',
    ]);
    expect(model.sections.find((section) => section.id === 'executive_summary')?.table).toEqual([
      {
        provision: 'DPDP Rules 4',
        effectiveFrom: '2026-11-13',
        sourceUrl: 'https://www.meity.gov.in/example.pdf',
        verifiedOn: '2026-11-26',
      },
    ]);
  });

  it('keeps attestations out of evidence and lists unknowns prominently', () => {
    const model = buildReportV2ViewModel(input());
    const evidence = model.sections.find((section) => section.id === 'evidence_of_safeguards');
    expect(evidence?.rows?.map((row) => row.controlCode)).toEqual(['DPDPA-7-LEGIT-01']);
    const unknown = model.sections.find((section) => section.id === 'could_not_determine');
    expect(unknown?.rows?.map((row) => row.controlCode)).toEqual(['DPDPA-9-CHILD-01']);
    expect(JSON.stringify(model)).not.toContain('CANARY_SOURCE_VALUE');
  });

  it('groups gaps and derives the fix plan only from non-passing verdicts', () => {
    const model = buildReportV2ViewModel(input());
    const gaps = model.sections.find((section) => section.id === 'gaps_by_section');
    expect(gaps?.groups).toEqual([
      { section: '8(4)', rows: [expect.objectContaining({ verdict: 'FAIL' })] },
    ]);
    const plan = model.sections.find((section) => section.id === 'fix_plan');
    expect(plan?.rows?.map((row) => row.remedy)).toEqual(['Use a managed credential store.']);
  });
});

import { mountSuspended } from '@nuxt/test-utils/runtime';
import { describe, expect, it } from 'vitest';

import NewScanDetail from '../app/components/new/NewScanDetail.vue';
import RuleDetectorExplainer from '../app/components/rules/RuleDetectorExplainer.vue';
import RuleMappingTable from '../app/components/rules/RuleMappingTable.vue';
import { getFixtureRule } from '../server/utils/fixtures/rules';
import type { ScanDetail } from '../shared/scan';

const FORBIDDEN = ['compliant', 'non-compliant', 'violation of the act', 'certified'];

const base = {
  id: 'scn_language',
  status: 'completed',
  coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
  repository: { id: 'r1', fullName: 'acme/repo', visibility: 'public' },
  ref: 'main',
  commitSha: null,
  previousScore: null,
  sectionScores: { '8(4)': 0, '6': 82 },
  counts: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
  scannerVersions: {},
  rulePackVersion: 'dpdpa-2026.10.6',
  error: null,
  timestamps: {
    queuedAt: '2026-11-27T05:00:00Z',
    startedAt: '2026-11-27T05:00:10Z',
    completedAt: '2026-11-27T05:01:00Z',
    durationMs: 50_000,
  },
  links: { findings: '', events: '', report: '' },
} satisfies Partial<ScanDetail>;

const scans = [
  {
    ...base,
    score: 90,
    grade: 'A',
    scoringVersion: '1.0.0',
    assessment: null,
  },
  {
    ...base,
    score: null,
    grade: null,
    scoringVersion: 'scoring-2.0.0',
    assessment: {
      score: null,
      evidenceCoverage: 0,
      openGaps: 0,
      verdictCounts: { UNKNOWN: 12 },
      unknownControls: ['DPDPA-8.4-SECRET-01'],
      detectorStatuses: { gitleaks: 'completed' },
      gradeWithheldReason: 'insufficient_evidence',
      consentGatingRatio: null,
    },
  },
] as unknown as ScanDetail[];

describe('readiness UI language', () => {
  it.each(scans)(
    'renders only readiness wording for scoringVersion $scoringVersion',
    async (scan) => {
      const wrapper = await mountSuspended(NewScanDetail, { props: { scan } });
      const text = wrapper.text().toLowerCase();
      for (const phrase of FORBIDDEN) {
        expect(text, `forbidden phrase: ${phrase}`).not.toContain(phrase);
      }
    },
  );

  it('renders only readiness wording in a rule mapping message', async () => {
    const wrapper = await mountSuspended(RuleMappingTable, {
      props: { mappings: getFixtureRule('DPDPA-8.4-ENC-01').mappings },
    });
    const text = wrapper.text().toLowerCase();
    expect(text).toContain('server-side encryption');
    for (const phrase of FORBIDDEN) {
      expect(text, `forbidden phrase: ${phrase}`).not.toContain(phrase);
    }
  });

  it('explains absence detectors with readiness-only wording', async () => {
    const wrapper = await mountSuspended(RuleDetectorExplainer, {
      props: {
        detectors: [
          {
            id: 'form_scan',
            module: 'inventory',
            inputs: ['source'],
            outputs: ['signal', 'status'],
            timeoutMs: 30_000,
            confidence: 'inferred',
            failureMode: 'UNKNOWN',
            controls: [
              {
                code: 'DPDPA-6-CONSENT-01',
                evidenceMode: 'absence',
                absenceTokens: ['consent_checkbox'],
              },
            ],
          },
        ],
      },
    });
    const text = wrapper.text().toLowerCase();
    expect(text).toContain('form_scan');
    expect(text).toContain('consent_checkbox');
    expect(text).toContain('could not determine');
    for (const phrase of FORBIDDEN) {
      expect(text, `forbidden phrase: ${phrase}`).not.toContain(phrase);
    }
  });
});

import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ReportTemplateModel } from '../src/modules/reports/report-template.js';
import { renderReportHtml } from '../src/modules/reports/report-template.js';
import { renderReportV2Pdf } from '../src/modules/reports/report-pdf-v2.js';
import { renderHtmlForModel } from '../src/modules/reports/report-renderers.js';
import {
  buildReportV2ViewModel,
  type ReportV2Input,
} from '../src/modules/reports/report-view-model-v2.js';

function base(scoringVersion: string): ReportTemplateModel {
  return {
    report: {
      id: 'rpt_1',
      format: 'pdf',
      templateVersion: scoringVersion === '1.0.0' ? '1.0.0' : '2.0.0',
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
      sectionScores: {},
      counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
      coverage: {},
      coverageStatus: 'full',
      scannerVersions: {},
      rulePackVersion: 'dpdpa-2026.11.0',
      scoringVersion,
      timestamps: {
        queuedAt: '2026-11-27T09:00:00.000Z',
        startedAt: null,
        completedAt: '2026-11-27T09:01:00.000Z',
        durationMs: 60_000,
      },
    },
    topFindings: [],
    methodology: {
      scoringVersion,
      rulePackVersion: 'dpdpa-2026.11.0',
      summary: 'Versioned readiness scoring.',
    },
    disclaimer: 'Technical aid only; not legal advice.',
    generatedAt: '2026-11-27T10:00:00.000Z',
  };
}

function v2Input(): ReportV2Input {
  return {
    base: base('scoring-2.0.0'),
    controlResults: [
      {
        controlCode: 'DPDPA-8.4-SECRET-01',
        section: '8(4)',
        verdict: 'FAIL',
        reasonCode: 'cited_gap',
        remediation: 'Use a managed credential store.',
      },
      {
        controlCode: 'DPDPA-9-CHILD-01',
        section: '9',
        verdict: 'UNKNOWN',
        reasonCode: 'detector_unavailable',
        remediation: 'Add a detector.',
      },
    ],
    inventory: null,
    commencement: [],
    detectorVersions: { gitleaks: '8.28.0' },
    provenanceSearches: [],
  };
}

/** Inflate PDFKit streams and decode hex glyph runs so headings are searchable. */
function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const decoded: string[] = [];
  for (const match of raw.matchAll(streams)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    decoded.push(
      content
        .replace(/\[([^\]]*)\]\s*TJ/g, (_all, body: string) =>
          (body.match(/<[0-9a-fA-F]+>/g) ?? [])
            .map((hex) => Buffer.from(hex.slice(1, -1), 'hex').toString('latin1'))
            .join(''),
        )
        .replace(/\(([^)]*)\)\s*Tj/g, (_all, value: string) => value),
    );
  }
  return decoded.join('\n');
}

describe('v2 report rendering', () => {
  it('renders all v2 sections into HTML and keeps v1 HTML unchanged', () => {
    const v2 = buildReportV2ViewModel(v2Input());
    const html = renderHtmlForModel(v2);
    for (const title of [
      'Executive readiness summary',
      'Gaps grouped by section',
      'Evidence of safeguards',
      'Could not determine',
      'Data inventory summary',
      'Fix plan',
      'Methodology and provenance',
      'Limitations',
      'Disclaimer',
    ]) {
      expect(html).toContain(title);
    }
    expect(html).not.toContain('CANARY_SOURCE_VALUE');
    const legacy = renderHtmlForModel(base('1.0.0'));
    expect(legacy).toBe(renderReportHtml(base('1.0.0')));
    expect(legacy).not.toContain('Gaps grouped by section');
  });

  it('renders a real multi-page PDF containing the v2 section titles', async () => {
    const buffer = await renderReportV2Pdf(buildReportV2ViewModel(v2Input()));
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(
      (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length,
    ).toBeGreaterThanOrEqual(9);
    const text = pdfText(buffer);
    expect(text).toContain('Executive readiness summary');
    expect(text).toContain('Could not determine');
    expect(text).not.toContain('CANARY_SOURCE_VALUE');
  });
});

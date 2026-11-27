import { describe, expect, it } from 'vitest';
import {
  renderReportHtml,
  type ReportTemplateModel,
} from '../src/modules/reports/report-template.js';

function model(overrides: Partial<ReportTemplateModel> = {}): ReportTemplateModel {
  return {
    report: {
      id: 'rpt_1',
      format: 'standard',
      templateVersion: '1.0.0',
      createdAt: '2026-11-04T10:05:00.000Z',
    },
    organization: {
      name: 'Acme Payments',
      slug: 'acme-payments',
      dataRegion: 'in',
      branding: { logoUrl: null, primaryColor: '#0f7b4f', footerText: null },
    },
    scan: {
      id: 'scn_1',
      repository: { fullName: 'acme/payments-service', visibility: 'public' },
      ref: 'main',
      commitSha: '9f2c1d7e4b8a6c0f3e2d1b0a9c8d7e6f5a4b3c2d',
      status: 'completed',
      score: 82.6,
      grade: 'B',
      sectionScores: { '5': 85, '6': 61.5, '12': null },
      counts: { critical: 3, high: 3, medium: 4, low: 3, info: 1, total: 14 },
      coverage: { semgrep: 'completed', checkov: 'completed', gitleaks: 'completed' },
      coverageStatus: 'full',
      rulePackVersion: '2026.10.1',
      scoringVersion: '1.0.0',
      timestamps: {
        queuedAt: '2026-11-04T09:31:22.481Z',
        startedAt: '2026-11-04T09:31:49.112Z',
        completedAt: '2026-11-04T09:37:04.903Z',
        durationMs: 322_422,
      },
    },
    topFindings: [
      {
        id: 'fnd_1',
        severity: 'critical',
        scanner: 'semgrep',
        message: 'PII written to logs',
        filePath: 'src/app.py',
        lineStart: 42,
        dpdpa: {
          code: 'DPDPA-8-4',
          section: '8(4)',
          title: 'Security safeguards',
          rationale: 'Logs are processing.',
        },
        remediation: {
          summary: 'Redact PII before logging',
          steps: ['Remove the log statement', 'Add a redaction filter'],
        },
      },
    ],
    methodology: {
      scoringVersion: '1.0.0',
      rulePackVersion: '2026.10.1',
      summary: 'Weighted mean of assessed sections.',
    },
    disclaimer: 'Not legal advice.',
    generatedAt: '2026-11-04T10:05:06.342Z',
    ...overrides,
  };
}

describe('renderReportHtml (P5-18)', () => {
  it('renders all seven template sections', () => {
    const html = renderReportHtml(model());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Executive summary');
    expect(html).toContain('Score breakdown');
    expect(html).toContain('Top findings');
    expect(html).toContain('Remediation');
    expect(html).toContain('Methodology');
    expect(html).toContain('Appendix');
    expect(html).toContain('DPDPA audit report');
  });

  it('emits the same numbers as the view model', () => {
    const html = renderReportHtml(model());
    expect(html).toContain('82.6');
    expect(html).toContain('acme/payments-service');
    expect(html).toContain('2026.10.1');
    expect(html).toContain('PII written to logs');
    expect(html).toContain('Redact PII before logging');
  });

  it('sorts sections worst-first and marks unassessed sections', () => {
    const html = renderReportHtml(model());
    const consent = html.indexOf('Consent');
    const notice = html.indexOf('Notice');
    const access = html.indexOf('Right to access');
    expect(consent).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(consent);
    expect(access).toBeGreaterThan(notice);
    expect(html).toContain('not assessed');
    expect(html).toContain('Evidence of a gap');
  });

  it('uses readiness-only section status wording', () => {
    const html = renderReportHtml(model());
    expect(html).toContain('Partial evidence');
    expect(html).toContain('Evidence of a gap');
    expect(html.toLowerCase()).not.toContain('compliant');
  });

  it('labels unassessed sections and unmapped findings explicitly', () => {
    const base = model();
    const html = renderReportHtml(
      model({
        topFindings: [{ ...base.topFindings[0]!, dpdpa: null }],
      }),
    );
    expect(html).toContain('Not assessed');
    expect(html).toContain('Unmapped — no DPDPA control');
    expect(html).toContain('Unmapped finding from semgrep');
  });

  it('withholds the grade when the scan has none', () => {
    const html = renderReportHtml(model({ scan: { ...model().scan, grade: null, score: 74.1 } }));
    expect(html).toContain('withheld');
    expect(html).toContain('74.1');
  });

  it('escapes markup from finding messages', () => {
    const base = model();
    const original = base.topFindings[0]!;
    const html = renderReportHtml(
      model({
        topFindings: [{ ...original, message: '<script>alert(1)</script>' }],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('handles a scan with no findings', () => {
    const html = renderReportHtml(model({ topFindings: [] }));
    expect(html).toContain('No open findings were recorded');
    expect(html).toContain('No remediation steps were attached');
  });

  it('includes the disclaimer and branding footer', () => {
    const html = renderReportHtml(model());
    expect(html).toContain('Not legal advice.');
    expect(html).toContain('Acme Payments - DPDPA audit report rpt_1');
  });
});

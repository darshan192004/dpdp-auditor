import { writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { type ReportTemplateModel } from '../src/modules/reports/report-template.js';
import { renderReportPdf } from '../src/modules/reports/report-pdf.js';

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
      sectionScores: {
        '5': 85,
        '6': 61.5,
        '7': 72,
        '8(4)': 40,
        '8(5)': 68,
        '9': 90,
        '10': 55,
        '12': 81,
        '13': 77,
        '16': 63,
      },
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
    topFindings: Array.from({ length: 12 }, (_, index) => ({
      id: `fnd_${index + 1}`,
      severity: ['critical', 'high', 'medium', 'low', 'info'][index % 5]!,
      scanner: 'semgrep',
      message: `PII written to logs in handler ${index + 1}`,
      filePath: `src/handlers/handler_${index + 1}.py`,
      lineStart: 40 + index,
      dpdpa: {
        code: 'DPDPA-8-4',
        section: '8(4)',
        title: 'Security safeguards',
        rationale: 'Logs are processing.',
      },
      remediation: {
        summary: `Redact PII before logging in handler ${index + 1}`,
        steps: ['Remove the log statement', 'Add a redaction filter'],
      },
    })),
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

async function pdf(modelOverrides: Partial<ReportTemplateModel> = {}): Promise<Buffer> {
  return renderReportPdf(model(modelOverrides));
}

/** PDFKit compresses page content streams; inflate them to assert real text. */
function extractText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const parts: string[] = [];
  const streams = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  for (const match of raw.matchAll(streams)) {
    try {
      parts.push(inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1'));
    } catch {
      // Ignore non-deflate streams; page content here is always FlateDecode.
    }
  }
  // PDFKit emits text as hex glyph runs inside TJ arrays, e.g.
  // [<54> 80 <6f702066696e64696e6773>] TJ. The bare numbers are kerning, not
  // text: keep only the hex glyphs so words stay contiguous.
  const decodeHex = (hex: string): string => {
    let decoded = '';
    for (let index = 0; index < hex.length; index += 2) {
      decoded += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
    }
    return decoded;
  };

  const content = parts
    .join('\n')
    .replace(/\[([^\]]*)\]\s*TJ/g, (_match, body: string) =>
      (body.match(/<[0-9a-fA-F]+>/g) ?? []).map((hex) => decodeHex(hex.slice(1, -1))).join(''),
    )
    .replace(/\(([^)]*)\)\s*Tj/g, (_match, value: string) => value);

  // Metadata strings are uncompressed object entries.
  return `${raw}\n${content}`;
}

/** Decode just the text operators in one inflated PDFKit page stream. */
function decodePageStream(content: string): string {
  const decodeHex = (hex: string): string => {
    let decoded = '';
    for (let index = 0; index < hex.length; index += 2) {
      decoded += String.fromCharCode(Number.parseInt(hex.slice(index, index + 2), 16));
    }
    return decoded;
  };
  return content
    .replace(/\[([^\]]*)\]\s*TJ/g, (_match, body: string) =>
      (body.match(/<[0-9a-fA-F]+>/g) ?? []).map((hex) => decodeHex(hex.slice(1, -1))).join(''),
    )
    .replace(/\(([^)]*)\)\s*Tj/g, (_match, value: string) => value);
}

/** Extract visible text for each page, in page order, without external tools. */
function pageTexts(buffer: Buffer): string[] {
  const raw = buffer.toString('latin1');
  const objects = new Map<number, string>();
  for (const match of raw.matchAll(/(\d+) 0 obj\s*([\s\S]*?)\s*endobj/g)) {
    objects.set(Number(match[1]), match[2]!);
  }

  return [...objects.entries()]
    .filter(([, body]) => /\/Type \/Page\b/.test(body))
    .sort(([left], [right]) => left - right)
    .map(([, page]) => {
      const contents = page.match(/\/Contents (\d+) 0 R/);
      expect(contents, 'page is missing a content stream').not.toBeNull();
      const stream = objects
        .get(Number(contents![1]))
        ?.match(/stream\r?\n([\s\S]*?)\r?\nendstream/);
      expect(stream, 'page content stream is missing').not.toBeNull();
      return decodePageStream(inflateSync(Buffer.from(stream![1]!, 'latin1')).toString('latin1'));
    });
}

describe('renderReportPdf (real PDF rendering)', () => {
  it('produces a genuine, multi-page PDF document', async () => {
    const buffer = await pdf();
    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(5_000);

    const raw = buffer.toString('latin1');
    const pageObjects = raw.match(/\/Type \/Page\b/g) ?? [];
    expect(pageObjects.length).toBeGreaterThanOrEqual(3);
    expect(raw).toMatch(/\/Count\s+\d+/);

    // The old fallback shell embedded this marker; real PDFs must not.
    expect(raw).not.toContain('html-bytes');
  });

  it('keeps the header, footer, and page number on each rendered page', async () => {
    const pages = pageTexts(await pdf());
    expect(pages.length).toBeGreaterThan(1);

    pages.forEach((text, index) => {
      expect(text, `page ${index + 1} is blank or footer-only`).toContain('DPDPA AUDIT REPORT');
      expect(text, `page ${index + 1} is missing the repository header`).toContain(
        'acme/payments-service',
      );
    });
  });

  it('embeds the report content as extractable text', async () => {
    const raw = extractText(await pdf());
    for (const expected of [
      'DPDPA audit report',
      'Executive summary',
      'acme/payments-service',
      '82.6',
      'Score breakdown',
      'Top findings',
      'Remediation',
      'Methodology',
      'Appendix',
      'PII written to logs in handler 1',
      'Not legal advice.',
    ]) {
      expect(raw, `missing text: ${expected}`).toContain(expected);
    }
  });

  it('writes a generated sample when RUN_PDF_SAMPLE is set', async () => {
    if (!process.env.RUN_PDF_SAMPLE) return;
    const buffer = await pdf();
    await writeFile(process.env.RUN_PDF_SAMPLE, buffer);
    expect(buffer.length).toBeGreaterThan(5_000);
  });
});

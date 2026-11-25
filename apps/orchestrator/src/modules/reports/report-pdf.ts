/**
 * P5-18: real PDF rendering for report v1.
 *
 * Builds a multi-page A4 PDF directly from the shared report view model using
 * PDFKit. No browser, no network and no fallback shell: every report is a real
 * document with selectable text. The HTML template in `report-template.ts`
 * remains the on-screen preview; both are driven by the same model.
 */

import PDFDocument from 'pdfkit';
import type { ReportTemplateModel } from './report-template.js';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BOTTOM = PAGE_HEIGHT - MARGIN - 24;
// PDFKit's usable area ends at PAGE_HEIGHT - MARGIN. Text placed lower than
// this silently creates a new page, so keep the footer inside the margin.
const FOOTER_Y = PAGE_HEIGHT - MARGIN - 12;

const INK = '#16181d';
const MUTED = '#5b616e';
const HAIRLINE = '#d8dbe2';
const ACCENT = '#0f7b4f';

type FontName = 'Helvetica' | 'Helvetica-Bold' | 'Courier';

const SECTION_LABELS: Record<string, string> = {
  '5': 'Notice',
  '6': 'Consent',
  '7': 'Legitimate uses',
  '8(4)': 'Security safeguards',
  '8(5)': 'Breach notification',
  '9': "Children's data",
  '10': 'SDF obligations',
  '12': 'Right to access',
  '13': 'Correction and erasure',
  '16': 'Cross-border transfer',
};

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

function iso(value: Date | string | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '-';
  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function score(value: number | null): string {
  return value === null ? '-' : value.toFixed(1);
}

function duration(ms: number | null): string {
  if (ms === null) return '-';
  const seconds = Math.round(ms / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function shortSha(sha: string | null): string {
  return sha === null ? '-' : sha.slice(0, 7);
}

function sectionStatus(value: number | null): string {
  if (value === null) return 'not assessed';
  if (value >= 90) return 'compliant';
  if (value >= 75) return 'partial';
  return 'non-compliant';
}

/** Small layout engine over PDFKit: tracks a cursor and paginates blocks. */
class ReportWriter {
  private y = MARGIN + 12;
  private pageNo = 1;

  constructor(
    private readonly doc: PDFKit.PDFDocument,
    private readonly model: ReportTemplateModel,
  ) {
    this.header();
  }

  private get footerText(): string {
    return (
      this.model.organization.branding.footerText ??
      `${this.model.organization.name} - DPDPA audit report ${this.model.report.id}`
    );
  }

  private setText(font: FontName, size: number, color = INK): void {
    this.doc.font(font).fontSize(size).fillColor(color);
  }

  private header(): void {
    this.setText('Helvetica', 7.5, MUTED);
    this.doc.text('DPDPA AUDIT REPORT', MARGIN, 22, {
      width: 220,
      characterSpacing: 1.1,
      lineBreak: false,
    });
    this.doc.text(this.model.scan.repository.fullName, PAGE_WIDTH - MARGIN - 260, 22, {
      width: 260,
      align: 'right',
      lineBreak: false,
    });
    this.doc
      .moveTo(MARGIN, 36)
      .lineTo(PAGE_WIDTH - MARGIN, 36)
      .strokeColor(HAIRLINE)
      .lineWidth(0.6)
      .stroke();
    this.y = MARGIN + 12;
  }

  private footer(): void {
    this.setText('Helvetica', 7.5, '#8b919e');
    this.doc.text(this.footerText, MARGIN, FOOTER_Y, {
      width: CONTENT_WIDTH - 60,
      lineBreak: false,
    });
    this.doc.text(`Page ${this.pageNo}`, PAGE_WIDTH - MARGIN - 50, FOOTER_Y, {
      width: 50,
      align: 'right',
      lineBreak: false,
    });
  }

  private nextPage(): void {
    this.footer();
    this.doc.addPage();
    this.pageNo += 1;
    this.header();
  }

  private ensure(height: number): void {
    if (this.y + height > BOTTOM) this.nextPage();
  }

  private textHeight(text: string, width: number, font: FontName, size: number): number {
    this.setText(font, size);
    return this.doc.heightOfString(text, { width, lineGap: 2 });
  }

  private heading(text: string): void {
    this.ensure(44);
    this.setText('Helvetica-Bold', 15);
    this.doc.text(text, MARGIN, this.y, { width: CONTENT_WIDTH, lineBreak: false });
    this.y = this.doc.y + 5;
    this.doc
      .moveTo(MARGIN, this.y)
      .lineTo(PAGE_WIDTH - MARGIN, this.y)
      .strokeColor(HAIRLINE)
      .lineWidth(0.6)
      .stroke();
    this.y += 11;
  }

  private subheading(text: string): void {
    this.ensure(28);
    this.setText('Helvetica-Bold', 11.5);
    this.doc.text(text, MARGIN, this.y, { width: CONTENT_WIDTH, lineBreak: false });
    this.y = this.doc.y + 8;
  }

  private paragraph(text: string, size = 9.5, color: string = MUTED): void {
    const height = this.textHeight(text, CONTENT_WIDTH, 'Helvetica', size);
    this.ensure(height + 6);
    this.setText('Helvetica', size, color);
    this.doc.text(text, MARGIN, this.y, { width: CONTENT_WIDTH, lineGap: 2 });
    this.y = this.doc.y + 6;
  }

  private bullets(items: readonly string[]): void {
    for (const item of items) {
      const height = this.textHeight(`-  ${item}`, CONTENT_WIDTH - 14, 'Helvetica', 9.5);
      this.ensure(height + 2);
      this.setText('Helvetica', 9.5);
      this.doc.text(`-  ${item}`, MARGIN + 12, this.y, {
        width: CONTENT_WIDTH - 14,
        lineGap: 1,
      });
      this.y = this.doc.y + 2;
    }
    this.y += 6;
  }

  private kpis(items: ReadonlyArray<{ label: string; value: string }>): void {
    this.ensure(52);
    const width = CONTENT_WIDTH / items.length;
    items.forEach((item, index) => {
      const x = MARGIN + index * width;
      this.setText('Helvetica', 7.5, MUTED);
      this.doc.text(item.label.toUpperCase(), x, this.y, {
        width: width - 10,
        characterSpacing: 0.9,
        lineBreak: false,
      });
      this.setText('Helvetica-Bold', 22);
      this.doc.text(item.value, x, this.y + 13, { width: width - 10, lineBreak: false });
    });
    this.y += 44;
  }

  private keyValues(rows: ReadonlyArray<readonly [string, string]>): void {
    for (const [label, value] of rows) {
      this.ensure(18);
      this.setText('Helvetica-Bold', 8.5, MUTED);
      this.doc.text(label.toUpperCase(), MARGIN, this.y, {
        width: 120,
        characterSpacing: 0.6,
        lineBreak: false,
      });
      this.setText('Helvetica', 9.5);
      this.doc.text(value, MARGIN + 126, this.y, { width: CONTENT_WIDTH - 126 });
      this.y = Math.max(this.doc.y, this.y + 14) + 3;
    }
    this.y += 6;
  }

  private table(
    headers: readonly string[],
    rows: ReadonlyArray<readonly string[]>,
    widths: readonly number[],
  ): void {
    const drawHeader = (): void => {
      this.ensure(24);
      this.doc
        .rect(MARGIN, this.y - 3, CONTENT_WIDTH, 20)
        .fill('#f3f4f7')
        .fillOpacity(1);
      this.setText('Helvetica-Bold', 7.5, MUTED);
      let x = MARGIN;
      headers.forEach((header, index) => {
        this.doc.text(header.toUpperCase(), x + 5, this.y, {
          width: (widths[index] ?? 0) - 10,
          characterSpacing: 0.7,
          lineBreak: false,
        });
        x += widths[index] ?? 0;
      });
      this.y += 18;
    };

    drawHeader();
    for (const row of rows) {
      const heights = row.map((cell, index) =>
        this.textHeight(cell, (widths[index] ?? 0) - 10, 'Helvetica', 8.5),
      );
      const rowHeight = Math.max(18, ...heights) + 8;
      this.ensure(rowHeight);
      if (this.y + rowHeight > BOTTOM) {
        drawHeader();
      }

      let x = MARGIN;
      row.forEach((cell, index) => {
        this.setText('Helvetica', 8.5);
        this.doc.text(cell, x + 5, this.y, { width: (widths[index] ?? 0) - 10, lineGap: 1 });
        x += widths[index] ?? 0;
      });
      this.y += rowHeight - 6;
      this.doc
        .moveTo(MARGIN, this.y)
        .lineTo(PAGE_WIDTH - MARGIN, this.y)
        .strokeColor('#eceef2')
        .lineWidth(0.5)
        .stroke();
      this.y += 6;
    }
    this.y += 10;
  }

  render(): void {
    const { model } = this;
    const primary = model.organization.branding.primaryColor ?? ACCENT;

    // 1. Cover
    this.y = 150;
    this.setText('Helvetica', 8.5, MUTED);
    this.doc.text('DPDPA AUDIT REPORT', MARGIN, this.y, {
      width: CONTENT_WIDTH,
      characterSpacing: 1.4,
    });
    this.y += 18;
    this.doc.rect(MARGIN, this.y, 64, 4).fill(primary);
    this.y += 24;
    this.setText('Helvetica-Bold', 26);
    this.doc.text(model.scan.repository.fullName, MARGIN, this.y, { width: CONTENT_WIDTH });
    this.y = this.doc.y + 10;
    this.setText('Helvetica', 12);
    this.doc.text(
      `${model.organization.name}  ·  ${model.scan.ref} @ ${shortSha(model.scan.commitSha)}`,
      MARGIN,
      this.y,
      { width: CONTENT_WIDTH },
    );
    this.y = this.doc.y + 16;
    this.paragraph(
      `Generated ${iso(model.generatedAt)}  ·  report ${model.report.id}  ·  template ${model.report.templateVersion}`,
      9,
    );
    this.nextPage();

    // 2. Executive summary
    this.heading('Executive summary');
    this.kpis([
      { label: 'Score', value: score(model.scan.score) },
      { label: 'Grade', value: model.scan.grade ?? 'withheld' },
      { label: 'Findings', value: String(model.scan.counts.total) },
      { label: 'Coverage', value: model.scan.coverageStatus },
    ]);
    this.keyValues([
      ['Repository', model.scan.repository.fullName],
      ['Visibility', model.scan.repository.visibility],
      ['Ref', model.scan.ref],
      ['Commit', shortSha(model.scan.commitSha)],
      ['Duration', duration(model.scan.timestamps.durationMs)],
      ['Completed', iso(model.scan.timestamps.completedAt)],
    ]);

    // 3. Score breakdown
    this.heading('Score breakdown');
    this.subheading('Findings by severity');
    this.table(
      ['Severity', 'Count'],
      SEVERITIES.map((severity) => [severity, String(model.scan.counts[severity] ?? 0)]),
      [CONTENT_WIDTH * 0.7, CONTENT_WIDTH * 0.3],
    );
    this.subheading('Section scores');
    const sections = Object.entries(model.scan.sectionScores)
      .map(([code, value]) => ({ code, value }))
      .sort((a, b) => {
        if (a.value === null && b.value === null) return a.code.localeCompare(b.code);
        if (a.value === null) return 1;
        if (b.value === null) return -1;
        return a.value - b.value;
      });
    this.table(
      ['Control', 'Section', 'Score', 'Status'],
      sections.map(({ code, value }) => [
        code,
        SECTION_LABELS[code] ?? code,
        score(value),
        sectionStatus(value),
      ]),
      [CONTENT_WIDTH * 0.14, CONTENT_WIDTH * 0.42, CONTENT_WIDTH * 0.14, CONTENT_WIDTH * 0.3],
    );

    // 4. Top findings
    this.heading('Top findings');
    if (model.topFindings.length === 0) {
      this.paragraph('No open findings were recorded for this scan.');
    } else {
      this.table(
        ['Severity', 'Control', 'Finding', 'Location'],
        model.topFindings.map((finding) => [
          finding.severity,
          finding.dpdpa?.section ?? '-',
          `${finding.message}\n${finding.dpdpa?.title ?? finding.scanner}`,
          `${finding.filePath}:${finding.lineStart}`,
        ]),
        [CONTENT_WIDTH * 0.12, CONTENT_WIDTH * 0.12, CONTENT_WIDTH * 0.53, CONTENT_WIDTH * 0.23],
      );
    }

    // 5. Remediation
    this.heading('Remediation');
    const actionable = model.topFindings.filter((finding) => finding.remediation !== null);
    if (actionable.length === 0) {
      this.paragraph('No remediation steps were attached to the findings in this scan.');
    } else {
      for (const finding of actionable.slice(0, 20)) {
        this.subheading(`${finding.severity}: ${finding.remediation?.summary ?? finding.message}`);
        this.paragraph(
          finding.dpdpa
            ? `Control ${finding.dpdpa.code}: ${finding.dpdpa.title}`
            : `Scanner: ${finding.scanner}`,
          8.5,
        );
        this.bullets(finding.remediation?.steps ?? []);
      }
    }

    // 6. Methodology
    this.heading('Methodology');
    this.paragraph(model.methodology.summary, 9.5, '#3d434f');
    this.keyValues([
      ['Scoring version', model.methodology.scoringVersion ?? '-'],
      ['Rule pack', model.methodology.rulePackVersion ?? '-'],
      ['Template', model.report.templateVersion],
    ]);

    // 7. Appendix
    this.heading('Appendix');
    this.keyValues([
      ['Report ID', model.report.id],
      ['Scan ID', model.scan.id],
      ['Data region', model.organization.dataRegion],
      ['Generated', iso(model.generatedAt)],
    ]);
    this.paragraph(model.disclaimer, 8.5);

    this.footer();
  }
}

/** Render a real A4 PDF from the shared report view model. */
export function renderReportPdf(model: ReportTemplateModel): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: {
        Title: `${model.scan.repository.fullName} - DPDPA audit report`,
        Author: model.organization.name,
        Subject: `DPDPA audit report ${model.report.id}`,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      new ReportWriter(doc, model).render();
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

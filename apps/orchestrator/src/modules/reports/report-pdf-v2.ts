import PDFDocument from 'pdfkit';
import type { buildReportV2ViewModel } from './report-view-model-v2.js';

type V2Model = ReturnType<typeof buildReportV2ViewModel>;

/** Real PDFKit document with one page per readiness section and selectable text. */
export async function renderReportV2Pdf(model: V2Model): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  for (const section of model.sections) {
    doc.addPage();
    doc.fontSize(16).text(section.title);
    doc.moveDown().fontSize(10);
    for (const row of section.rows ?? []) {
      doc.text(
        [row.controlCode, row.section, row.verdict, row.reasonCode ?? row.remedy]
          .filter((value): value is string => value !== undefined)
          .join(' · '),
      );
    }
    for (const group of section.groups ?? []) {
      doc.text(`Section ${group.section}`);
      for (const row of group.rows) {
        doc.text(`${row.controlCode ?? ''} · ${row.verdict ?? ''}`);
      }
    }
    for (const entry of section.table ?? []) {
      doc.text(
        `${entry.provision} · effective ${entry.effectiveFrom} · verified ${entry.verifiedOn}`,
      );
    }
    if (section.text !== undefined) doc.text(section.text);
  }
  doc.end();
  return done;
}
